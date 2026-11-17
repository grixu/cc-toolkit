import { expect, mock, test } from 'claude-code/testing'
import {
  SKIP_FACTS,
  STORY_FACTS,
  THRESHOLDS,
  aggregateFacts,
  averageFacts,
  chooseGateBackends,
  decide,
  planStory,
  storyIntent,
  storyQuestions,
} from '../hooks/story.ts'

const TOOL = 'mcp__dev-kit__story_signals'
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/decisions'
const FACTS = Object.keys(storyQuestions())

const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } })
const fileDiff = (path: string, body: string) => `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,1 +1,2 @@\n${body}`

type File = { path: string; text?: string; binary?: boolean }

function fakeGit(files: File[], lines: string[][] = []) {
  return ($, e) => {
    const argv: string[] = e.argv
    if (argv[0] === 'sh') {
      lines.push(argv.slice(-2))
      return ok('')
    }
    const args = argv.slice(1)
    if (args[1] === '--show-toplevel') return ok('/work\n')
    if (args[0] === 'remote') return ok('git@github.com:acme/shop.git\n')
    if (args[0] === 'branch') return ok('feat/typo\n')
    if (args[0] === 'rev-parse' && args[1] === 'HEAD') return ok('abc123\n')
    if (args[0] === 'rev-parse') return { value: { exitCode: args[3] === 'origin/main^{commit}' ? 0 : 1, stdout: '', stderr: '' } }
    if (args[0] === 'log') return ok('fix: correct a typo\n\nThe greeting misspelled hello.\n\0')
    if (args.includes('--stat=200')) return ok(files.map((f) => ` ${f.path} | 1 +`).join('\n'))
    if (args.includes('--numstat')) return ok(files.map((f) => `${f.binary ? '-' : '1'}\t${f.binary ? '-' : '0'}\t${f.path}\0`).join(''))
    const pathspec = args[args.length - 1]
    return ok(files.find((f) => pathspec === `:(top,literal)${f.path}`)?.text ?? '')
  }
}

const wire = (p: Record<string, number>) => Object.fromEntries(FACTS.map((k) => [k, { noul: p[k] ?? 0.05 }]))
const jev = (p: Record<string, number>) => ({ status: 200, ok: true, headers: {}, text: JSON.stringify({ model: 'jev-1.14.0', answers: wire(p), usage: {} }) })
const gemini = (p: Record<string, number>) => ({ status: 200, ok: true, headers: {}, text: JSON.stringify({ answers: wire(p), usage: {} }) })
const denied = { status: 401, ok: false, headers: {}, text: 'no' }

const TYPO = [{ path: 'src/greeting.ts', text: fileDiff('src/greeting.ts', '-helo\n+hello') }]
const BODY = 'Fixes a typo in the greeting.\n\n## Code story\n\n[story](https://claude.ai/x)\n\n## Risk\n\n**low**'

test('the intent drops the generated sections pr-open adds and keeps what the author wrote', () => {
  const intent = storyIntent('fix: greeting typo', 'Why.\n\n## Proof\n\nshots\n\n## Testing\n\nRan it.\n\n## Risk\n\n**low**\n\n[PL-1]: https://x', 'c1')
  expect(intent.title).toBe('fix: greeting typo')
  expect(intent.description).toBe('Why.\n\n## Testing\n\nRan it.\n\n[PL-1]: https://x')
  expect(intent.commits).toBe('c1')
})

test('a change too large for the allowed requests is never sent', () => {
  const huge = Array.from({ length: 12 }, (_, i) => ({ path: `src/f${i}.ts`, text: fileDiff(`src/f${i}.ts`, '+' + 'x'.repeat(30_000)) }))
  expect(planStory(huge, 'stat').tooLarge).toBe(true)
  const small = planStory(TYPO, 'stat', storyIntent('t', 'd', 'c'))
  expect(small.tooLarge).toBe(false)
  if (!small.tooLarge) expect(small.states[0]).toMatchObject({ intent: { title: 't' }, diffstat: 'stat', files: ['src/greeting.ts'] })
})

test('a skip fact holds only as far as its weakest part, a story fact as far as its strongest', () => {
  const part = (skip: number, story: number) =>
    Object.fromEntries([
      ...Object.keys(SKIP_FACTS).map((k) => [k, { type: 'binary' as const, p: skip }]),
      ...Object.keys(STORY_FACTS).map((k) => [k, { type: 'binary' as const, p: story }]),
    ])
  const facts = aggregateFacts([part(0.9, 0.1), part(0.3, 0.7)])
  expect(facts.localized_fix).toBe(0.3)
  expect(facts.new_or_restructured_flow).toBe(0.7)
  expect(averageFacts([{ localized_fix: 1 }, { localized_fix: 0.5 }]).localized_fix).toBe(0.75)
})

test('a story fact over its threshold wins over any skip fact', () => {
  const t = THRESHOLDS.both
  expect(decide({ localized_fix: 0.95, new_or_restructured_flow: 0.92 }, t)).toEqual({ story: true, reason: 'new_or_restructured_flow' })
  expect(decide({ localized_fix: 0.95, new_or_restructured_flow: 0.5 }, t)).toEqual({ story: false, reason: 'localized_fix' })
  expect(decide({ localized_fix: 0.6 }, t)).toEqual({ story: true, reason: 'no skip fact held' })
})

test('auto runs every backend with a key, and a named backend needs its own key', () => {
  const both = { typesafe: 't', gemini: 'g' }
  expect(chooseGateBackends({}, both)).toEqual(['typesafe', 'gemini'])
  expect(chooseGateBackends({ story_gate_backend: 'auto' }, { typesafe: '', gemini: 'g' })).toEqual(['gemini'])
  expect(chooseGateBackends({ story_gate_backend: 'gemini' }, both)).toEqual(['gemini'])
  expect(chooseGateBackends({ story_gate_backend: 'both' }, both)).toEqual(['typesafe', 'gemini'])
  expect(() => chooseGateBackends({ story_gate_backend: 'both' }, { typesafe: 't', gemini: '' })).toThrow(/no Gemini API key/)
  expect(() => chooseGateBackends({}, { typesafe: '', gemini: '' })).toThrow(/no TypeSafe API key.*; or no Gemini API key/)
})

test('skips the story for a typo, sending the intent without generated sections, and logs no diff text', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 't', HOME: '/home/u' })
  const lines: string[][] = []
  on('process.run', fakeGit(TYPO, lines))
  const bodies: { state: Record<string, unknown> }[] = []
  on('http.fetch', ($, e) => {
    bodies.push(JSON.parse(e.init.body))
    return { value: jev({ cosmetic_only: 0.95 }) }
  })

  const result = JSON.parse((await $.tool.call({ tool: TOOL, base: 'main', title: 'fix: greeting typo', description: BODY })).result)

  expect(result).toMatchObject({ story: false, reason: 'cosmetic_only', backend: 'typesafe', models: { typesafe: 'jev-1.14.0' } })
  expect(bodies.length).toBe(1)
  expect(bodies[0].state.intent).toEqual({ title: 'fix: greeting typo', description: 'Fixes a typo in the greeting.', commits: 'fix: correct a typo\n\nThe greeting misspelled hello.' })
  expect(bodies[0].state.diff).toContain('+hello')
  expect(lines.length).toBe(1)
  expect(lines[0][0]).toBe('/home/u/.cache/dev-kit/story-gate.jsonl')
  expect(JSON.parse(lines[0][1])).toMatchObject({ repo: 'shop', branch: 'feat/typo', head: 'abc123', base: 'origin/main', story: false })
  expect(lines[0][1]).not.toContain('hello')
})

test('with both keys both backends answer, their facts are averaged, and the pair thresholds decide', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 't', GEMINI_API_KEY: 'g' })
  on('process.run', fakeGit(TYPO))
  // Averaged 0.775 is under the pair's 0.8, although each alone would clear Jev's 0.725.
  on('http.fetch', ($, e) => ({ value: e.url === GEMINI ? gemini({ localized_fix: 0.75 }) : jev({ localized_fix: 0.8 }) }))

  const result = JSON.parse((await $.tool.call({ tool: TOOL, base: 'main' })).result)

  expect(result).toMatchObject({ story: true, reason: 'no skip fact held', backend: 'both', models: { typesafe: 'jev-1.14.0', gemini: 'gemini-decision-1' } })
  expect(result.facts.localized_fix).toBe(0.78)
})

test('with one of two backends down, the other decides on its own thresholds and the failure is named', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 't', GEMINI_API_KEY: 'g' })
  on('process.run', fakeGit(TYPO))
  on('http.fetch', ($, e) => ({ value: e.url === GEMINI ? denied : jev({ localized_fix: 0.75 }) }))

  const result = JSON.parse((await $.tool.call({ tool: TOOL, base: 'main' })).result)

  expect(result).toMatchObject({ story: false, reason: 'localized_fix', backend: 'typesafe' })
  expect(result.failed).toEqual([{ backend: 'gemini', error: expect.stringMatching(/Gemini rejected the API key/) }])
})

test('a new flow keeps the story whatever the skip facts say', async ($, on) => {
  mock.env(on, { GEMINI_API_KEY: 'g' })
  on('process.run', fakeGit(TYPO))
  on('http.fetch', () => ({ value: gemini({ localized_fix: 0.99, new_or_restructured_flow: 0.95 }) }))

  const result = JSON.parse((await $.tool.call({ tool: TOOL, base: 'main' })).result)

  expect(result).toMatchObject({ story: true, reason: 'new_or_restructured_flow', backend: 'gemini' })
})

test('with every backend failing, the gate is unavailable with each reason', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 't', GEMINI_API_KEY: 'g' })
  on('process.run', fakeGit(TYPO))
  on('http.fetch', () => ({ value: denied }))

  const out = await $.tool.call({ tool: TOOL, base: 'main' })

  expect(out.result).toMatch(/^Story gate unavailable: TypeSafe: .*; Gemini: /)
})
