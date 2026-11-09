import { expect, mock, test } from 'claude-code/testing'
import { questions, intentQuestions } from '../hooks/risk.ts'
import { atomicQuestions, evidenceForFiles, experimentalAnswers, stripTrailingRisk, validateEvidence } from '../hooks/evidence.ts'

const ref = 'a'.repeat(40)
const entry = { path: 'src/a.ts', sources: [{ path: 'src/server.ts', ref, facts: ['checkAccess(user)'] }] }

test('evidence is bounded, source attributed and isolated by changed file', () => {
  const evidence = validateEvidence([entry], ['src/a.ts', 'src/b.ts'], [ref])
  expect(evidenceForFiles(evidence, ['src/b.ts'])).toEqual([])
  expect(evidenceForFiles(evidence, ['src/a.ts'])).toEqual([entry])
  expect(() => validateEvidence([entry], ['src/b.ts'], [ref])).toThrow()
  expect(() => validateEvidence([entry], ['src/a.ts'], ['b'.repeat(40)])).toThrow()
  expect(() => validateEvidence([{ ...entry, sources: [{ ...entry.sources[0], path: '../secret' }] }], ['src/a.ts'], [ref])).toThrow()
  expect(() => validateEvidence([{ ...entry, sources: [{ ...entry.sources[0], facts: ['x'.repeat(501)] }] }], ['src/a.ts'], [ref])).toThrow()
})

test('removes only a trailing risk section outside fenced examples', () => {
  const generated = '**Custom level** · impact high · likelihood low · confidence 0.8 · assessed by model'
  expect(stripTrailingRisk(`Purpose\n\n## Risk\n\n${generated}\nold result`)).toBe('Purpose')
  const prOpen = '**high** · impact core · complexity interacting logic · confidence 0.46 · assessed by jev-1.14.0 · Low confidence.'
  expect(stripTrailingRisk(`Purpose\n\n## Risk\n\n${prOpen}\n\n| Slice | Risk |\n|---|---|`)).toBe('Purpose')
  const released = '**high** · confidence 0.46 · assessed by jev-1.14.0 · Low confidence.'
  expect(stripTrailingRisk(`Purpose\n\n## Risk\n\n${released}\n\n- Touches security (0.62)`)).toBe('Purpose')
  expect(stripTrailingRisk('Purpose\n\n## Risk\nHuman analysis')).toBe('Purpose\n\n## Risk\nHuman analysis')
  expect(stripTrailingRisk('```md\n## Risk\nexample\n```')).toBe('```md\n## Risk\nexample\n```')
  expect(stripTrailingRisk('## Risk\nold\n## Testing\npassed')).toBe('## Risk\nold\n## Testing\npassed')
  expect(stripTrailingRisk('## Risk\nold\n# New title\ntext')).toBe('## Risk\nold\n# New title\ntext')
})

test('atomic questions have distinct opt-in keys', () => {
  expect(Object.keys(atomicQuestions()).length).toBe(10)
  const signals = experimentalAnswers({ server_enforcement: { noul: 0.1 }, server_enforcement_evidence_sufficient: { noul: 0.1 }, ordering_dependencies: { noul: NaN } })
  expect(signals.server_enforcement.status).toBe('unknown')
  expect(signals.ordering_dependencies.status).toBe('missing')
  const classify = (value: number, evidence = 0.7) => experimentalAnswers({ server_enforcement: { noul: value }, server_enforcement_evidence_sufficient: { noul: evidence } }).server_enforcement.status
  expect(classify(0.3)).toBe('absent')
  expect(classify(0.301)).toBe('unknown')
  expect(classify(0.699)).toBe('unknown')
  expect(classify(0.7)).toBe('present')
  expect(classify(0.7, 0.699)).toBe('unknown')
})

test('evidence and experimental questions reach only the matching diff request', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  on('process.run', ($, e) => {
    const args = e.argv.slice(1)
    let stdout = ''
    if (args[0] === 'rev-parse') stdout = ref + '\n'
    else if (args[0] === 'log') stdout = 'change'
    else if (args.includes('--numstat')) stdout = '1\t0\tsrc/a.ts\0' + '1\t0\tsrc/b.ts\0'
    else if (args.includes('--name-status')) stdout = 'M\0src/a.ts\0M\0src/b.ts\0'
    else if (args[0] === 'show') stdout = 'function checkAccess(user) {}'
    else if (args[0] === 'diff') {
      const path = args[args.length - 1].replace(':(literal)', '')
      stdout = `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n+x()`
    }
    return { value: { exitCode: 0, stdout, stderr: '' } }
  })
  const requests: any[] = []
  on('http.fetch', ($, e) => {
    const body = JSON.parse(e.init.body)
    requests.push(body)
    const answers: Record<string, unknown> = {}
    for (const key of [...Object.keys(questions()), ...Object.keys(intentQuestions()), ...Object.keys(atomicQuestions())]) answers[key] = { noul: key.endsWith('_evidence_sufficient') ? 0.9 : 0.1 }
    delete answers.ordering_dependencies
    answers.defect_impact = { score: 1, confidence: 0.8 }
    answers.defect_likelihood = { score: 1, confidence: 0.8 }
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ model: 'test', answers }) } }
  })
  const out = await $.tool.call({ tool: 'mcp__dev-kit__pr_risk', base: 'main', slices: [{ title: 'A', files: ['src/a.ts'] }, { title: 'B', files: ['src/b.ts'] }], execution_context: [entry], risk_experiment: 'atomic-v1', context: 'Purpose\n\n## Risk\n\n**high** · impact high · likelihood low · confidence 0.8 · assessed by model\nold result' })
  const report = JSON.parse(out.result)
  const diffs = requests.filter((r) => 'diff' in r.state)
  expect(diffs.find((r) => r.state.files.includes('src/a.ts')).state.execution_context).toEqual([entry])
  expect(diffs.find((r) => r.state.files.includes('src/b.ts')).state.execution_context).toBeUndefined()
  expect(diffs[0].questions.server_enforcement.type).toBe('noul')
  expect(requests.find((r) => !('diff' in r.state)).state.context).toBe('Purpose')
  expect(report.experimental.signals.length).toBe(2)
  expect(report.experimental.status).toBe('incomplete')
  expect(report.experimental.signals[0].answers.ordering_dependencies.status).toBe('missing')
  const ordinary = JSON.parse((await $.tool.call({ tool: 'mcp__dev-kit__pr_risk', base: 'main', slices: [{ title: 'A', files: ['src/a.ts'] }, { title: 'B', files: ['src/b.ts'] }] })).result)
  expect(report.level).toBe(ordinary.level)
  expect(ordinary.experimental).toBeUndefined()
  expect(ordinary.riskPolicy).toBe('calibrated-v1')
  const stricter = JSON.parse((await $.tool.call({ tool: 'mcp__dev-kit__pr_risk', base: 'main', risk_policy: 'evidence-v1', slices: [{ title: 'A', files: ['src/a.ts'] }, { title: 'B', files: ['src/b.ts'] }] })).result)
  expect(stricter.riskPolicy).toBe('evidence-v1')
})

test('unreviewable changes and invalid evidence fail before model requests', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  let excludedOnly = true
  let requests = 0
  on('process.run', ($, e) => {
    const args = e.argv.slice(1)
    let stdout = ''
    if (args[0] === 'rev-parse') stdout = ref + '\n'
    else if (args[0] === 'log') stdout = 'change'
    else if (args.includes('--numstat')) stdout = excludedOnly ? '1\t0\tpnpm-lock.yaml\0' : '1\t0\tsrc/a.ts\0'
    else if (args.includes('--name-status')) stdout = excludedOnly ? 'M\0pnpm-lock.yaml\0' : 'M\0src/a.ts\0'
    else if (args[0] === 'show') stdout = 'different committed source'
    else if (args[0] === 'diff') stdout = 'diff --git a/src/a.ts b/src/a.ts\n+x()'
    return { value: { exitCode: 0, stdout, stderr: '' } }
  })
  on('http.fetch', () => { requests++; return { value: { status: 500, ok: false, headers: {}, text: '' } } })
  const empty = await $.tool.call({ tool: 'mcp__dev-kit__pr_risk', base: 'main' })
  expect(empty.result).toContain('no reviewable text files')
  excludedOnly = false
  const stale = await $.tool.call({ tool: 'mcp__dev-kit__pr_risk', base: 'main', execution_context: [{ ...entry, sources: [{ ...entry.sources[0], ref: 'b'.repeat(40) }] }] })
  expect(stale.result).toContain('invalid execution_context')
  const excerpt = await $.tool.call({ tool: 'mcp__dev-kit__pr_risk', base: 'main', execution_context: [entry] })
  expect(excerpt.result).toContain('excerpt not found')
  const invalidPolicy = await $.tool.call({ tool: 'mcp__dev-kit__pr_risk', base: 'main', risk_policy: 'unknown' })
  expect(invalidPolicy.result).toContain('unsupported risk_policy')
  expect(requests).toBe(0)
})
