import { expect, mock, test } from 'claude-code/testing'
import {
  aggregate,
  assignSlices,
  fileStatuses,
  halve,
  intentQuestions,
  intentState,
  isDependencyManifest,
  labelFor,
  majorBumps,
  parseSlices,
  partState,
  questions,
  readConfig,
  split,
} from '../hooks/risk.ts'

const TOOL = 'mcp__dev-kit__pr_risk'

type Numstat = { path: string; text?: string; binary?: boolean; status?: string; before?: string; after?: string }

const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } })

function fakeGit(files: Numstat[]) {
  return ($, e) => {
    const args: string[] = e.argv.slice(1)
    if (args[0] === 'rev-parse') return { value: { exitCode: args[3] === 'origin/main^{commit}' ? 0 : 1, stdout: '', stderr: '' } }
    if (args[0] === 'log') return ok('abc123 feat: add login\n')
    if (args[0] === 'merge-base') return ok('base123\n')
    if (args[0] === 'show') {
      const [rev, path] = args[1].split(/:(.*)/)
      const file = files.find((f) => f.path === path)
      return ok((rev === 'HEAD' ? file?.after : file?.before) ?? '')
    }
    if (args.includes('--stat=200')) return ok(files.map((f) => ` ${f.path} | 1 +`).join('\n'))
    if (args.includes('--numstat')) return ok(files.map((f) => `${f.binary ? '-' : '1'}\t${f.binary ? '-' : '0'}\t${f.path}\0`).join(''))
    if (args.includes('--name-status')) return ok(files.map((f) => `${f.status ?? 'M'}\0${f.path}\0`).join(''))
    const pathspec = args[args.length - 1]
    return ok(files.find((f) => pathspec === `:(literal)${f.path}`)?.text ?? '')
  }
}

const TYPE_KEYS = Object.entries(questions())
  .filter(([, q]) => (q as { type: string }).type === 'noul')
  .map(([key]) => key)
const INTENT_KEYS = Object.keys(intentQuestions())

const isIntent = (e) => !('diff' in JSON.parse(e.init.body).state)

function answers(impact: number, likelihood: number, types: string[] = []) {
  const a: Record<string, { score?: number; confidence?: number; noul?: number }> = {
    defect_impact: { score: impact, confidence: 0.8 },
    defect_likelihood: { score: likelihood, confidence: 0.6 },
  }
  for (const key of [...TYPE_KEYS, ...INTENT_KEYS]) a[key] = { noul: types.includes(key) ? 0.9 : 0.1 }
  return a
}

function jevAnswer(impact: number, likelihood: number, types: string[] = []) {
  const body = { model: 'jev-1.14.0', answers: answers(impact, likelihood, types), usage: {} }
  return { status: 200, ok: true, headers: {}, text: JSON.stringify(body) }
}

const fileDiff = (path: string, body: string) =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,1 +1,2 @@\n${body}`

test('registers the tool only when a key is set', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  const registered: string[] = []
  on('tool.register', ($, e) => {
    registered.push(e.name)
    return { value: { tool: TOOL } }
  })
  on('session.start', () => ({ cwd: '/work' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(registered).toEqual(['pr_risk'])
})

test('without a key the tool is not registered', async ($, on) => {
  mock.env(on, {})
  const registered: string[] = []
  on('tool.register', ($, e) => {
    registered.push(e.name)
    return { value: { tool: TOOL } }
  })
  on('session.start', () => ({ cwd: '/work' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(registered).toEqual([])
})

test('assesses the diff without lockfiles and binaries', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  on(
    'process.run',
    fakeGit([
      { path: 'src/auth.ts', text: fileDiff('src/auth.ts', '+checkToken()') },
      { path: 'pnpm-lock.yaml', text: fileDiff('pnpm-lock.yaml', '+lock') },
      { path: 'logo.png', binary: true },
    ]),
  )
  const requests: { url: string; init: { headers: Record<string, string>; body: string } }[] = []
  on('http.fetch', ($, e) => {
    requests.push(e)
    return { value: jevAnswer(4.2, 0.8, ['authentication', 'new_functionality']) }
  })

  const out = await $.tool.call({ tool: TOOL, base: 'main' })
  const report = JSON.parse(out.result)
  const diffRequest = requests.find((r) => !isIntent(r))!
  const body = JSON.parse(diffRequest.init.body)

  expect(requests.length).toBe(2)
  expect(diffRequest.url).toBe('https://api.typesafe.ai/v1/systemone')
  expect(diffRequest.init.headers.authorization).toBe('Bearer secret')
  expect(body.model).toBe('jev-1.14.0')
  expect(body.state.diff).toContain('checkToken')
  expect(body.state.diff).not.toContain('pnpm-lock.yaml')
  expect(body.questions.defect_impact.criteria.length).toBe(5)
  expect(body.questions.defect_likelihood.criteria.length).toBe(4)
  expect(TYPE_KEYS.length).toBe(31)
  expect(Object.keys(body.questions).some((k) => INTENT_KEYS.includes(k))).toBe(false)
  expect(Object.keys(body.questions.secret_handling.criteria)).toEqual(['true', 'false'])
  expect(body.questions.observability.instructions).toMatch(/^A substantial part of the changes in `diff` is this system's own telemetry/)

  expect(report.level).toBe('high')
  expect(report.impact).toEqual({ level: 'severe', score: 4.2 })
  expect(report.likelihood).toEqual({ level: 'simple', score: 0.8 })
  expect(report.confidence).toBe(0.6)
  expect(report.lowConfidence).toBe(false)
  expect(report.types).toEqual(['authentication'])
  expect(report.intents).toEqual(['new_functionality'])
  expect(report.base).toBe('origin/main')
  expect(report.flags.map((f) => f.key)).toEqual(['security', 'untested'])
  expect(report.label).toEqual({
    enabled: true,
    name: 'risk: high',
    all: ['risk: low', 'risk: medium', 'risk: high', 'risk: critical'],
  })
  expect(report.coverage).toMatchObject({ requests: 1, filesAssessed: 1, filesExcluded: 2, partial: false })
})

test('marks confidence low when a diff hunk is truncated', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  on('process.run', fakeGit([{ path: 'src/large.ts', text: fileDiff('src/large.ts', `+${'x'.repeat(200_000)}`) }]))
  on('http.fetch', () => ({ value: jevAnswer(2, 1) }))

  const report = JSON.parse((await $.tool.call({ tool: TOOL, base: 'main' })).result)

  expect(report.coverage.partial).toBe(true)
  expect(report.coverage.truncatedHunks).toBeGreaterThan(0)
  expect(report.confidence).toBe(0.6)
  expect(report.lowConfidence).toBe(true)
})

test('a cut in prose or test data leaves the assessment complete', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  const fixtures = Array.from({ length: 5 }, (_, i) => ({
    path: `e2e-playwright/fixtures/run${i}.json`,
    text: fileDiff(`e2e-playwright/fixtures/run${i}.json`, `+${'x'.repeat(600_000)}`),
  }))
  const spec = { path: 'docs/specs/plan.md', text: fileDiff('docs/specs/plan.md', `+${'y'.repeat(200_000)}`) }
  on('process.run', fakeGit([...fixtures, spec, { path: 'src/a.ts', text: fileDiff('src/a.ts', '+a()') }]))
  const diffs: string[] = []
  on('http.fetch', ($, e) => {
    if (!isIntent(e)) diffs.push(JSON.parse(e.init.body).state.diff)
    return { value: jevAnswer(2, 1) }
  })

  const report = JSON.parse((await $.tool.call({ tool: TOOL, base: 'main' })).result)

  expect(report.coverage).toMatchObject({ filesNotAssessed: 0, truncatedHunks: 6, partial: false })
  expect(report.lowConfidence).toBe(false)
  expect(diffs.some((d) => d.includes('+a()'))).toBe(true)
})

test('marks confidence low when the request limit leaves files unassessed', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  const files = Array.from({ length: 35 }, (_, i) => ({
    path: `src/file${i}.ts`,
    text: fileDiff(`src/file${i}.ts`, `+${'x'.repeat(40_000)}`),
  }))
  on('process.run', fakeGit(files))
  on('http.fetch', () => ({ value: jevAnswer(2, 1) }))

  const report = JSON.parse((await $.tool.call({ tool: TOOL, base: 'main' })).result)

  expect(report.coverage.partial).toBe(true)
  expect(report.coverage.filesNotAssessed).toBeGreaterThan(0)
  expect(report.confidence).toBe(0.6)
  expect(report.lowConfidence).toBe(true)
})

function policyRun(on, policyNoul: number | 'error') {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  on('process.run', fakeGit([{ path: 'src/Card.vue', text: fileDiff('src/Card.vue', '+<Card :clickable="true" />') }]))
  const policyRequests: { state: Record<string, unknown> }[] = []
  on('http.fetch', ($, e) => {
    const body = JSON.parse(e.init.body)
    if (!('testing_policy' in body.state)) return { value: jevAnswer(2, 1, ['ui_components', 'bug_fix']) }
    policyRequests.push(body)
    if (policyNoul === 'error') return { value: { status: 400, ok: false, headers: {}, text: 'bad request' } }
    const text = JSON.stringify({ answers: { tests_required_by_policy: { noul: policyNoul } } })
    return { value: { status: 200, ok: true, headers: {}, text } }
  })
  return policyRequests
}

test('a testing policy that leaves components to e2e clears the untested flag', async ($, on) => {
  const policyRequests = policyRun(on, 0.1)
  const out = await $.tool.call({ tool: TOOL, base: 'main', testing_policy: 'Components get no unit tests; e2e covers them.' })
  const report = JSON.parse(out.result)

  expect(policyRequests.length).toBe(1)
  expect(policyRequests[0].state).toMatchObject({
    testing_policy: 'Components get no unit tests; e2e covers them.',
    files: ['src/Card.vue: modified +1 -0'],
    change_types: ['ui_components'],
    tests_in_change: ['(none)'],
  })
  expect(report.flags.map((f) => f.key)).toEqual([])
})

test('the untested flag stays when the policy wants a test', async ($, on) => {
  policyRun(on, 0.9)
  const wanted = JSON.parse((await $.tool.call({ tool: TOOL, base: 'main', testing_policy: 'Every change ships a test.' })).result)
  expect(wanted.flags.map((f) => f.key)).toEqual(['untested'])
})

test('a failed policy request keeps the untested flag', async ($, on) => {
  policyRun(on, 'error')
  const report = JSON.parse((await $.tool.call({ tool: TOOL, base: 'main', testing_policy: 'Every change ships a test.' })).result)
  expect(report.flags.map((f) => f.key)).toEqual(['untested'])
})

test('without a testing policy no policy request is sent', async ($, on) => {
  const policyRequests = policyRun(on, 0.1)
  const report = JSON.parse((await $.tool.call({ tool: TOOL, base: 'main' })).result)
  expect(policyRequests.length).toBe(0)
  expect(report.flags.map((f) => f.key)).toEqual(['untested'])
})

function deploymentRun(on, contextImpact: number | 'error') {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  on('process.run', fakeGit([{ path: 'charts/app/values.yaml', text: fileDiff('charts/app/values.yaml', '+replicas: 2') }]))
  const contextRequests: { state: Record<string, unknown>; questions: Record<string, { instructions: string }> }[] = []
  on('http.fetch', ($, e) => {
    const body = JSON.parse(e.init.body)
    if (!('deployment_context' in body.state)) return { value: jevAnswer(4, 1) }
    contextRequests.push(body)
    if (contextImpact === 'error') return { value: { status: 400, ok: false, headers: {}, text: 'bad request' } }
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ answers: { defect_impact: { score: contextImpact, confidence: 0.7 } } }) } }
  })
  return contextRequests
}

const DEPLOYED = 'Stage deploys on merge; production waits for a reviewer.'

test('a deployment context replaces only the impact answer, from its own request', async ($, on) => {
  const contextRequests = deploymentRun(on, 2)
  const report = JSON.parse((await $.tool.call({ tool: TOOL, base: 'main', deployment_context: ` ${DEPLOYED} ` })).result)

  expect(contextRequests.length).toBe(1)
  expect(contextRequests[0].state).toMatchObject({ deployment_context: DEPLOYED, files: ['charts/app/values.yaml'] })
  expect(contextRequests[0].state.diff).toContain('replicas: 2')
  expect(Object.keys(contextRequests[0].questions)).toEqual(['defect_impact'])
  expect(contextRequests[0].questions.defect_impact.instructions).toBe(
    "If the change in `diff` contains a mistake, what is the worst consequence once it is deployed? `deployment_context`, when present, describes where this repository's changes are deployed and who they reach; use it only to judge how far a mistake in `diff` would reach.",
  )
  expect(report.impact).toEqual({ level: 'feature', score: 2 })
  expect(report.likelihood.level).toBe('simple')
  expect(report.coverage.impactWithoutDeploymentContext).toBe(0)
})

test('a failed deployment-context request keeps the plain impact answer', async ($, on) => {
  deploymentRun(on, 'error')
  const report = JSON.parse((await $.tool.call({ tool: TOOL, base: 'main', deployment_context: DEPLOYED })).result)
  expect(report.impact.level).toBe('severe')
  expect(report.coverage.impactWithoutDeploymentContext).toBe(1)
})

test('without a deployment context no context request is sent', async ($, on) => {
  const contextRequests = deploymentRun(on, 2)
  const report = JSON.parse((await $.tool.call({ tool: TOOL, base: 'main' })).result)
  expect(contextRequests.length).toBe(0)
  expect(report.impact.level).toBe('severe')
  expect('impactWithoutDeploymentContext' in report.coverage).toBe(false)
})

test('a deployment context over 1,500 characters is refused', async ($, on) => {
  const contextRequests = deploymentRun(on, 2)
  const out = await $.tool.call({ tool: TOOL, base: 'main', deployment_context: 'x'.repeat(1_501) })
  expect(out.result).toMatch(/^Risk assessment unavailable: `deployment_context` is 1501 characters/)
  expect(contextRequests.length).toBe(0)
})

test('splits a large diff across requests and keeps the riskiest part', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  const big = (path: string) => ({ path, text: fileDiff(path, '+x'.repeat(30_000)) })
  on('process.run', fakeGit([big('a.ts'), big('b.ts'), big('c.ts')]))
  let n = 0
  on('http.fetch', ($, e) => {
    if (isIntent(e)) return { value: jevAnswer(0, 0) }
    n += 1
    return { value: n === 2 ? jevAnswer(3.8, 2.6, ['schema_or_data_migration']) : jevAnswer(0.4, 0.2) }
  })

  const report = JSON.parse((await $.tool.call({ tool: TOOL, base: 'main' })).result)

  expect(report.coverage.requests).toBe(n)
  expect(n > 1).toBe(true)
  expect(report.level).toBe('critical')
  expect(report.flags.map((f) => f.key)).toEqual(['data'])
})

test('reads a path with glob characters literally', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  on('process.run', fakeGit([{ path: 'app/[id]/page.tsx', text: fileDiff('app/[id]/page.tsx', '+route') }]))
  let body = ''
  on('http.fetch', ($, e) => {
    if (!isIntent(e)) body = e.init.body
    return { value: jevAnswer(2, 1) }
  })
  await $.tool.call({ tool: TOOL, base: 'main' })
  expect(JSON.parse(body).state.diff).toContain('+route')
})

test('reports a rejected key', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'bad' })
  on('process.run', fakeGit([{ path: 'a.ts', text: fileDiff('a.ts', '+a') }]))
  on('http.fetch', () => ({ value: { status: 401, ok: false, headers: {}, text: 'unauthorized' } }))
  const out = await $.tool.call({ tool: TOOL, base: 'main' })
  expect(out.result).toMatch(/^Risk assessment unavailable: TypeSafe rejected the API key \(HTTP 401\)/)
})

test('reports an answer without a numeric score as unavailable', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  on('process.run', fakeGit([{ path: 'a.ts', text: fileDiff('a.ts', '+a') }]))
  on('http.fetch', () => ({ value: jevAnswer(Number.NaN, 1) }))
  const out = await $.tool.call({ tool: TOOL, base: 'main' })
  expect(out.result).toMatch(/^Risk assessment unavailable: TypeSafe returned no numeric answer for "defect_impact"/)
})

test('refuses a base that git could read as an option', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  const out = await $.tool.call({ tool: TOOL, base: '--output=/tmp/x' })
  expect(out.result).toMatch(/`base` must be a branch name/)
})

test('reads the level from the impact and likelihood of a mistake', () => {
  const config = readConfig({})
  const level = (impact: number, likelihood: number) =>
    aggregate([{ model: 'jev', answers: answers(impact, likelihood) }], [], config, [], ['a.ts'], new Map()).level
  expect(level(0, 3)).toBe('low')
  expect(level(4, 0)).toBe('medium')
  expect(level(2.4, 1.6)).toBe('medium')
  expect(level(3, 2)).toBe('high')
  expect(level(3.6, 2.5)).toBe('critical')
})

test('reads a level from the median of its probabilities, not the averaged score', () => {
  const config = readConfig({})
  const split = answers(3.45, 2)
  split.defect_impact = { score: 3.45, probabilities: { '0': 0.03, '1': 0.01, '2': 0.2, '3': 0.02, '4': 0.74 }, confidence: 0.4 }
  const report = aggregate([{ model: 'jev', answers: split }], [], config, [], ['a.ts'], new Map())
  expect(report.impact).toEqual({ level: 'severe', score: 3.45 })
  expect(report.level).toBe('critical')
})

test('takes only four level names', () => {
  expect(readConfig({ risk_levels: ['only'] }).levels).toEqual(['low', 'medium', 'high', 'critical'])
  expect(readConfig({ risk_levels: 'minor, major, severe' }).levels).toEqual(['low', 'medium', 'high', 'critical'])
  expect(readConfig({ risk_levels: 'p4, p3, p2, p1' }).levels).toEqual(['p4', 'p3', 'p2', 'p1'])
  expect(readConfig({ risk_label: false }).labelEnabled).toBe(false)
})

test('fills the label template', () => {
  expect(labelFor('risk/{level}', 'high')).toBe('risk/high')
  expect(labelFor('risk', 'high')).toBe('risk: high')
})

test('assesses each slice the caller gives on its own', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  on(
    'process.run',
    fakeGit([
      { path: 'src/auth.ts', text: fileDiff('src/auth.ts', '+checkToken()') },
      { path: 'src/auth.test.ts', text: fileDiff('src/auth.test.ts', '+it()') },
      { path: 'README.md', text: fileDiff('README.md', '+docs') },
      { path: 'src/stray.ts', text: fileDiff('src/stray.ts', '+stray()') },
    ]),
  )
  const states: { slice?: string; files: string[]; diff: string }[] = []
  on('http.fetch', ($, e) => {
    const state = JSON.parse(e.init.body).state
    if (!isIntent(e)) states.push(state)
    if (state.slice === 'Token checks') return { value: jevAnswer(4.1, 1.2, ['authentication', 'behavior_change']) }
    return { value: state.slice === 'Docs' ? jevAnswer(0.1, 0.2, ['documentation']) : jevAnswer(1.2, 0.9, ['behavior_change']) }
  })

  const slices = [
    { title: 'Token checks', files: ['src/auth.ts', 'src/auth.test.ts'] },
    { title: 'Docs', files: ['README.md', 'missing.ts', 'src/auth.ts'] },
  ]
  const report = JSON.parse((await $.tool.call({ tool: TOOL, base: 'main', slices })).result)

  expect(report.slicing).toEqual({ source: 'caller' })
  expect(states.map((s) => s.slice).sort()).toEqual(['Docs', 'Other changes', 'Token checks'])
  expect(states.find((s) => s.slice === 'Docs')?.diff).not.toContain('checkToken')
  expect(Object.keys(states[0]).sort()).toEqual(['diff', 'files', 'slice'])
  expect(report.slices.map((s) => [s.title, s.files, s.level, s.intents, s.types, s.flags])).toEqual([
    ['Token checks', ['src/auth.ts', 'src/auth.test.ts'], 'high', ['behavior_change'], ['authentication'], ['security']],
    ['Docs', ['README.md'], 'low', [], ['documentation'], []],
    ['Other changes', ['src/stray.ts'], 'medium', ['behavior_change'], [], ['untested']],
  ])
  expect(report.level).toBe('high')
  expect(report.flags.map((f) => f.key)).toEqual(['security', 'untested'])
})

test('lets the model slice the change when the caller does not', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  on(
    'process.run',
    fakeGit([
      { path: 'a.ts', text: fileDiff('a.ts', '+a') },
      { path: 'b.ts', text: fileDiff('b.ts', '+b') },
    ]),
  )
  let prompt = ''
  on('model.complete', ($, e) => {
    prompt = String(e.prompt)
    return { value: { isAnswered: true, text: 'Here: {"slices": [{"title": "Both", "files": [1, 2]}]}' } }
  })
  let requests = 0
  on('http.fetch', () => {
    requests += 1
    return { value: jevAnswer(2, 1) }
  })

  const report = JSON.parse((await $.tool.call({ tool: TOOL, base: 'main' })).result)

  expect(prompt).toContain('1. a.ts (+1 -0)')
  expect(report.slicing).toEqual({ source: 'model' })
  expect(report.slices.map((s) => s.files)).toEqual([['a.ts', 'b.ts']])
  expect(requests).toBe(2)
})

test('packs the diff by size when the slicing model does not answer', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  on('process.run', fakeGit([{ path: 'a.ts', text: fileDiff('a.ts', '+a') }]))
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'api-error' } }))
  on('http.fetch', () => ({ value: jevAnswer(2, 1) }))

  const report = JSON.parse((await $.tool.call({ tool: TOOL, base: 'main' })).result)

  expect(report.slicing).toEqual({ source: 'size', reason: 'slicing model did not answer: api-error' })
  expect(report.slices).toEqual([])
  expect(report.level).toBe('medium')
})

test('retries a rate-limited request', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  const clock = mock.clock(on)
  on('process.run', fakeGit([{ path: 'a.ts', text: fileDiff('a.ts', '+a') }]))
  let calls = 0
  on('http.fetch', ($, e) => {
    if (isIntent(e)) return { value: jevAnswer(0, 0) }
    calls += 1
    return { value: calls === 1 ? { status: 429, ok: false, headers: { 'retry-after': '2' }, text: 'slow down' } : jevAnswer(2, 1) }
  })

  const pending = $.tool.call({ tool: TOOL, base: 'main', slices: [{ title: 'A', files: ['a.ts'] }] })
  for (let i = 0; i < 5 && calls < 2; i++) await clock.advance(1000)
  const report = JSON.parse((await pending).result)

  expect(calls).toBe(2)
  expect(report.level).toBe('medium')
})

test('splits a request Jev refuses as too long and assesses both halves', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  on('process.run', fakeGit([{ path: 'a.ts', text: fileDiff('a.ts', '+a'.repeat(4000)) }, { path: 'b.ts', text: fileDiff('b.ts', '+b'.repeat(4000)) }]))
  const diffs: string[] = []
  on('http.fetch', ($, e) => {
    if (isIntent(e)) return { value: jevAnswer(0, 0) }
    const { diff } = JSON.parse(e.init.body).state
    diffs.push(diff)
    if (diff.length > 10_000) return { value: { status: 400, ok: false, headers: {}, text: '{"error":{"code":"max_tokens_exceeded"}}' } }
    return { value: jevAnswer(diff.includes('+b') ? 3 : 1, 2) }
  })

  const report = JSON.parse((await $.tool.call({ tool: TOOL, base: 'main', slices: [{ title: 'Both', files: ['a.ts', 'b.ts'] }] })).result)

  expect(diffs.length).toBe(3)
  expect(report.coverage.requests).toBe(2)
  expect(report.slices[0].impact.level).toBe('core')
})

test('halves a part at file boundaries, keeping each file header', () => {
  const part = { files: ['a.ts', 'b c.ts'], diff: [fileDiff('a.ts', '+a'.repeat(50)), fileDiff('b c.ts', '+b'.repeat(50))].join('\n') }
  const { parts } = halve(part)
  expect(parts.map((p) => p.files)).toEqual([['a.ts'], ['b c.ts']])
  expect(parts[1].diff.startsWith('diff --git a/b c.ts b/b c.ts')).toBe(true)
})

test('keeps every file in exactly one slice', () => {
  const paths = ['a', 'b', 'c', 'd']
  expect(assignSlices([{ title: ' X ', files: ['a', 'zz', 'a'] }, { files: ['a', 'b'] }, { title: 'Empty', files: ['zz'] }], paths)).toEqual([
    { title: 'X', files: ['a'] },
    { title: 'Slice 2', files: ['b'] },
    { title: 'Other changes', files: ['c', 'd'] },
  ])
  const many = paths.map((p) => ({ title: p, files: [p] }))
  expect(assignSlices(many, paths, 3).map((s) => s.files)).toEqual([['a'], ['b'], ['c', 'd']])
  expect(assignSlices(many, paths, 4).map((s) => s.files)).toEqual([['a'], ['b'], ['c'], ['d']])
  expect(assignSlices('not a list', paths)).toEqual([{ title: 'Other changes', files: paths }])
})

test('reads the slicing reply by file number', () => {
  expect(parseSlices('```json\n{"slices": [{"title": "T", "files": [2, 9, "1"]}]}\n```', ['a', 'b'])).toEqual([
    { title: 'T', files: ['b', undefined, undefined] },
  ])
  expect(parseSlices('no json here', ['a'])).toBe(undefined)
})

test('reports files beyond the request cap as not assessed', () => {
  const files = ['a', 'b', 'c'].map((p) => ({ path: p, text: 'x'.repeat(90) }))
  const plan = split(files, 100, 2)
  expect(plan.parts.map((p) => p.files)).toEqual([['a'], ['b']])
  expect(plan.skippedFiles).toEqual(['c'])
})

test('asks for the intent from the purpose and file statistics, without the diff', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  on(
    'process.run',
    fakeGit([
      { path: 'src/flags.ts', text: fileDiff('src/flags.ts', '+flag()'), status: 'A' },
      { path: 'src/old.ts', text: fileDiff('src/old.ts', '-old()'), status: 'D' },
      { path: 'README.md', text: fileDiff('README.md', '+docs') },
      { path: 'src/dead.ts', text: fileDiff('src/dead.ts', '-dead()'), status: 'D' },
    ]),
  )
  const intents: Record<string, unknown>[] = []
  on('http.fetch', ($, e) => {
    if (isIntent(e)) intents.push(JSON.parse(e.init.body))
    return { value: jevAnswer(1, 1) }
  })
  const slices = [
    { title: 'Flags', files: ['src/flags.ts', 'src/old.ts'] },
    { title: 'Docs', files: ['README.md'] },
    { title: 'Cleanup', files: ['src/dead.ts'] },
  ]
  const report = JSON.parse((await $.tool.call({ tool: TOOL, base: 'main', slices, context: 'PL-1: move flags' })).result)

  const flags = intents.find((b) => (b.state as { slice: string }).slice === 'Flags')!
  expect(Object.keys(flags.questions as object)).toEqual(INTENT_KEYS)
  expect(flags.state).toEqual({
    context: 'PL-1: move flags',
    commits: 'abc123 feat: add login',
    slice: 'Flags',
    files: ['src/flags.ts: added +1 -0', 'src/old.ts: deleted -0'],
    other_slices: ['Docs', 'Cleanup'],
  })
  const intentsOf = (title: string) => report.slices.find((s: { title: string }) => s.title === title).intents
  expect(intentsOf('Flags')).toEqual([])
  expect(intentsOf('Cleanup')).toEqual(['code_removal'])
})

test('weighs what happened against the two scores', () => {
  const config = readConfig({})
  const one = (impact: number, likelihood: number, types: string[], intents: string[], statuses = new Map()) =>
    aggregate(
      [{ model: 'jev', answers: answers(impact, likelihood, types), slice: 0 }],
      [{ group: 0, answers: answers(0, 0, intents) }],
      config,
      [{ title: 'S', files: ['a.ts', 'b.ts'] }],
      ['a.ts', 'b.ts'],
      statuses,
    ).slices[0]

  const gated = one(3, 2, ['feature_flag_gated'], ['new_functionality'])
  expect([gated.level, gated.impact.level]).toEqual(['high', 'core'])
  expect(one(3, 2, ['feature_flag_gated', 'schema_or_data_migration'], ['new_functionality']).level).toBe('high')

  const changed = one(1, 1, [], ['behavior_change'])
  expect([changed.level, changed.impact.level]).toEqual(['medium', 'feature'])

  const restyled = one(0, 1, ['ui_components', 'unit_or_integration_tests'], ['behavior_change'])
  expect([restyled.level, restyled.impact.level]).toEqual(['low', 'minor'])
  expect(restyled.adjustments).toEqual(['impact raised to minor: an existing screen looks different for its current users'])

  const renamed = one(3, 2, ['data_access'], ['refactor', 'rename_or_move'])
  expect([renamed.level, renamed.likelihood.level]).toEqual(['medium', 'simple'])
  expect(one(3, 2, ['data_access'], ['bug_fix', 'rename_or_move']).level).toBe('high')

  const uiFix = one(2, 1, ['ui_components', 'ui_interactions', 'unit_or_integration_tests'], ['bug_fix'])
  expect([uiFix.level, uiFix.impact.level]).toEqual(['low', 'minor'])
  expect(one(2, 1, ['ui_interactions'], []).impact.level).toBe('feature')
  expect(one(2, 1, ['ui_interactions'], ['new_functionality']).impact.level).toBe('feature')
  expect(one(2, 1, ['ui_interactions', 'data_access'], ['bug_fix']).impact.level).toBe('feature')

  const condition = one(0, 3, [], ['behavior_condition_change'])
  expect([condition.level, condition.impact.level]).toEqual(['medium', 'minor'])
  expect(condition.adjustments).toEqual(['impact raised to minor: who gets an existing behaviour, or when, changes'])

  const invoicing = one(2, 1, ['irreversible_external_effect'], ['bug_fix'])
  expect([invoicing.level, invoicing.impact.level]).toEqual(['high', 'severe'])
  const gatedMail = one(2, 1, ['irreversible_external_effect', 'feature_flag_gated'], ['new_functionality'])
  expect(gatedMail.impact.level).toBe('severe')
  const localDb = one(3, 1, ['team_only_scope', 'runtime_environment'], [])
  expect([localDb.level, localDb.impact.level]).toEqual(['low', 'minor'])
  const tfImport = one(3, 1, ['infrastructure_state_dependent', 'cloud_infrastructure'], [])
  expect([tfImport.level, tfImport.likelihood.level]).toEqual(['high', 'non-trivial'])
  const smallImport = one(2, 1, ['infrastructure_state_dependent', 'cloud_infrastructure'], [])
  expect([smallImport.level, smallImport.impact.level]).toEqual(['high', 'core'])

  const splitImpact = (types: string[]) => {
    const a = answers(2, 2, types)
    a.defect_impact = { score: 2.4, confidence: 0.7, probabilities: { '0': 0.1, '2': 0.6, '4': 0.3 } } as typeof a.defect_impact
    return aggregate([{ model: 'jev', answers: a, slice: 0 }], [], config, [{ title: 'S', files: ['a.ts'] }], ['a.ts'], new Map()).slices[0]
  }
  const backfill = splitImpact(['schema_or_data_migration'])
  expect([backfill.level, backfill.impact.level]).toEqual(['critical', 'severe'])
  expect(backfill.adjustments).toEqual([
    'impact raised to severe: the slice touches security or stored data, and a severe outcome is a real possibility',
  ])
  expect(splitImpact(['ui_components']).impact.level).toBe('feature')

  const prose = aggregate(
    [{ model: 'jev', answers: answers(1, 1, ['api_contract', 'documentation', 'ai_assistant_instructions']), slice: 0 }],
    [],
    config,
    [{ title: 'Notes', files: ['.changeset/x.md', 'CLAUDE.md'] }],
    ['.changeset/x.md', 'CLAUDE.md'],
    new Map(),
  ).slices[0]
  expect(prose.types).toEqual(['ai_assistant_instructions', 'documentation'])

  const documented = aggregate(
    [{ model: 'jev', answers: answers(1, 1, ['documentation']), slice: 0 }],
    [{ group: 0, answers: answers(0, 0, ['new_functionality']) }],
    config,
    [{ title: 'Docs', files: ['docs/a.md', 'docs/flow.mmd', 'skills/x/SKILL.md'] }],
    ['docs/a.md', 'docs/flow.mmd', 'skills/x/SKILL.md'],
    new Map(),
  ).slices[0]
  expect(documented.flags).toEqual([])
  expect(one(1, 1, [], ['new_functionality']).flags).toEqual(['untested'])

  const schemaDocs = aggregate(
    [{ model: 'jev', answers: answers(1, 1, ['documentation', 'generated_artifacts']), slice: 0 }],
    [{ group: 0, answers: answers(0, 0, ['behavior_change']) }],
    config,
    [{ title: 'API docs', files: ['docs/api.md', 'frontend/src/schema.ts'] }],
    ['docs/api.md', 'frontend/src/schema.ts'],
    new Map(),
  ).slices[0]
  expect(schemaDocs.flags).toEqual([])

  const splitTests = aggregate(
    [
      { model: 'jev', answers: answers(1, 1, ['data_access']), slice: 0 },
      { model: 'jev', answers: answers(1, 1, ['unit_or_integration_tests']), slice: 1 },
    ],
    [{ group: 0, answers: answers(0, 0, ['bug_fix']) }],
    config,
    [
      { title: 'Routes', files: ['src/routes/articles.ts', 'src/db.ts'] },
      { title: 'Route tests', files: ['src/routes/__tests__/articles.test.ts'] },
    ],
    ['src/routes/articles.ts', 'src/db.ts', 'src/routes/__tests__/articles.test.ts'],
    new Map(),
  ).slices[0]
  expect(splitTests.flags).toEqual([])

  const moved = fileStatuses('R100\0old/a.ts\0a.ts\0R100\0old/b.ts\0b.ts\0', [])
  const move = one(3, 3, [], [], moved)
  expect([move.level, move.likelihood.level, move.intents]).toEqual(['medium', 'simple', ['rename_or_move']])
})

test('scope reductions require complete, consistent evidence across the slice', () => {
  const config = readConfig({})
  const report = (parts: string[][], complete = true) => aggregate(
    parts.map((types) => ({ model: 'jev', answers: answers(3, 2, types), slice: 0 })),
    [], config, [{ title: 'S', files: ['a.ts'] }], ['a.ts'], new Map(), new Set(), complete,
  ).slices[0]

  expect(report([['team_only_scope'], ['team_only_scope']]).impact.level).toBe('minor')
  const mixed = report([['team_only_scope'], ['irreversible_external_effect']])
  expect([mixed.impact.level, mixed.level]).toEqual(['severe', 'critical'])
  expect(mixed.types).not.toContain('team_only_scope')
  for (const signal of ['authorization', 'irreversible_external_effect']) {
    expect(report([['team_only_scope', signal]]).impact.level).not.toBe('minor')
  }
  expect(report([['team_only_scope']], false).impact.level).toBe('core')
  const multipleSlices = aggregate(
    [
      { model: 'jev', answers: answers(2, 1, ['team_only_scope']), slice: 0 },
      { model: 'jev', answers: answers(2, 1), slice: 1 },
    ], [], config,
    [{ title: 'Team', files: ['a.ts'] }, { title: 'Other', files: ['b.ts'] }],
    ['a.ts', 'b.ts'], new Map(),
  )
  expect(multipleSlices.slices[0].types).toContain('team_only_scope')
  expect(multipleSlices.types).not.toContain('team_only_scope')

  const ui = aggregate(
    [{ model: 'jev', answers: answers(3, 2, ['ui_components']), slice: 0 }],
    [{ group: 0, answers: answers(0, 0, ['bug_fix']) }],
    config, [{ title: 'S', files: ['a.ts'] }], ['a.ts'], new Map(), new Set(), false,
  ).slices[0]
  expect(ui.impact.level).toBe('core')

  const unknownPart = aggregate(
    [
      { model: 'jev', answers: answers(0, 1, ['ui_components']), slice: 0 },
      { model: 'jev', answers: answers(0, 1), slice: 0 },
    ],
    [{ group: 0, answers: answers(0, 0, ['behavior_change']) }],
    config, [{ title: 'S', files: ['a.ts'] }], ['a.ts'], new Map(),
  ).slices[0]
  expect(unknownPart.impact.level).toBe('feature')

  const unrelatedTail = answers(2, 2)
  unrelatedTail.defect_impact = { score: 2.4, confidence: 0.7, probabilities: { '0': 0.1, '2': 0.6, '4': 0.3 } } as typeof unrelatedTail.defect_impact
  const separated = aggregate(
    [
      { model: 'jev', answers: answers(1, 1, ['authorization']), slice: 0 },
      { model: 'jev', answers: unrelatedTail, slice: 0 },
    ], [], config, [{ title: 'S', files: ['a.ts'] }], ['a.ts'], new Map(),
  ).slices[0]
  expect([separated.impact.level, separated.level]).toEqual(['feature', 'medium'])
})

test('team-only cap permits local data and infrastructure hazards but retains slice-wide safeguards', () => {
  const config = readConfig({})
  const report = (parts: ReturnType<typeof answers>[], complete = true, policy: 'calibrated-v1' | 'evidence-v1' = 'calibrated-v1', intents: string[] = []) => aggregate(
    parts.map((part) => ({ model: 'jev', answers: part, slice: 0 })),
    [{ group: 0, answers: answers(0, 0, intents) }], config,
    [{ title: 'Local reset', files: ['reset.ts'] }], ['reset.ts'], new Map(), new Set(), complete, policy,
  ).slices[0]
  const team = ['team_only_scope']
  for (const signal of ['schema_or_data_migration', 'data_removal_or_rewrite', 'data_access', 'infrastructure_state_dependent']) {
    const local = report([answers(3, 1, [...team, signal]), answers(3, 1, team)])
    expect(local.impact.level).toBe('minor')
    expect(local.types).toContain('team_only_scope')
    expect(report([answers(3, 1, [...team, signal])], true, 'evidence-v1').impact.level).toBe('core')
  }
  for (const signal of ['secret_handling', 'authentication', 'authorization', 'irreversible_external_effect']) {
    const blocked = report([answers(3, 1, team), answers(3, 1, [...team, signal])])
    expect(blocked.impact.level).not.toBe('minor')
    expect(blocked.types).not.toContain('team_only_scope')
  }
  expect(report([answers(3, 1, team), answers(3, 1)]).impact.level).toBe('core')
  expect(report([answers(3, 1, team)], false).impact.level).toBe('core')

  const tail = answers(2, 1, [...team, 'data_removal_or_rewrite'])
  tail.defect_impact = { score: 2.4, confidence: 0.7, probabilities: { '0': 0.1, '2': 0.6, '4': 0.3 } } as typeof tail.defect_impact
  const tailResult = report([tail])
  expect(tailResult.impact.level).toBe('minor')
  expect(tailResult.adjustments).toEqual([
    'impact raised to severe: the slice touches security or stored data, and a severe outcome is a real possibility',
    "impact capped at minor: the slice reaches only the team's local setup, agent rules or alerts",
  ])
  const rawTail = answers(2, 1)
  rawTail.defect_impact = tail.defect_impact
  expect(report([rawTail]).impact.level).toBe('feature')
  expect(report([tail], true, 'evidence-v1').impact.level).toBe('severe')
  expect(report([answers(4, 1, team), answers(3, 1, [...team, 'data_access'])]).impact.level).toBe('severe')
  expect(report([answers(4, 1, ['ui_components']), answers(3, 1, ['ui_components'])], true, 'calibrated-v1', ['bug_fix']).impact.level).toBe('severe')

  const guarded = report([answers(3, 3, [...team, 'infrastructure_state_dependent', 'ui_components'])], true, 'calibrated-v1', ['bug_fix', 'rename_or_move'])
  expect(guarded.impact.level).toBe('minor')
  expect(guarded.likelihood.level).toBe('intricate')
  expect(guarded.adjustments.some((adjustment) => adjustment.includes('only user-interface code'))).toBe(false)
  expect(guarded.adjustments.some((adjustment) => adjustment.includes('renames or moves'))).toBe(false)
})

test('risk policies differ on calibrated reductions while preserving hazard protections', () => {
  const config = readConfig({})
  const run = (types: string[], intents: string[], policy: 'calibrated-v1' | 'evidence-v1', impact = 3) => aggregate(
    [{ model: 'jev', answers: answers(impact, 2, types), slice: 0 }],
    [{ group: 0, answers: answers(0, 0, intents) }], config,
    [{ title: 'S', files: ['a.ts'] }], ['a.ts'], new Map(), new Set(), true, policy,
  ).slices[0]
  expect(run(['ui_components'], ['bug_fix'], 'calibrated-v1').impact.level).toBe('minor')
  expect(run(['ui_components'], ['bug_fix'], 'evidence-v1').impact.level).toBe('core')
  expect(run(['data_access'], ['rename_or_move'], 'calibrated-v1').likelihood.level).toBe('simple')
  expect(run(['data_access'], ['rename_or_move'], 'evidence-v1').likelihood.level).toBe('non-trivial')
  expect(run(['team_only_scope', 'runtime_environment'], [], 'calibrated-v1').impact.level).toBe('minor')
  expect(run(['team_only_scope', 'runtime_environment'], [], 'evidence-v1').impact.level).toBe('core')
  for (const policy of ['calibrated-v1', 'evidence-v1'] as const) {
    expect(run(['team_only_scope', 'authorization'], ['rename_or_move'], policy).likelihood.level).toBe('non-trivial')
    expect(run(['team_only_scope'], ['rename_or_move'], policy, 4).impact.level).toBe('severe')
    expect(run(['feature_flag_gated', 'irreversible_external_effect'], ['new_functionality'], policy).impact.level).toBe('severe')
  }
})

test('caps a slice made only of prose, but not agent instructions or code beside it', () => {
  const config = readConfig({})
  const slice = (files: string[], policy: 'calibrated-v1' | 'evidence-v1' = 'calibrated-v1') => aggregate(
    [{ model: 'jev', answers: answers(3, 3, ['documentation']), slice: 0 }],
    [{ group: 0, answers: answers(0, 0, ['behavior_change']) }], config,
    [{ title: 'Docs', files }], files, new Map(), new Set(), true, policy,
  ).slices[0]
  const spec = slice(['docs/specs/migration.md', '.changeset/x.md'])
  expect([spec.level, spec.impact.level, spec.likelihood.level]).toEqual(['low', 'minor', 'simple'])
  expect(spec.adjustments).toEqual(['impact capped at minor and likelihood at simple: the slice holds only prose, such as docs, specs or changesets'])
  expect(slice(['docs/a.md', 'skills/x/SKILL.md']).level).toBe('high')
  expect(slice(['docs/a.md', 'src/a.ts']).level).toBe('high')
  expect(slice(['docs/specs/migration.md'], 'evidence-v1').level).toBe('high')
})

test('raises the likelihood of a slice that moves a runtime dependency to a new major version', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  const manifest = (react: string) => JSON.stringify({ dependencies: { react }, devDependencies: { vitest: '^3.0.0' } })
  on('process.run', fakeGit([
    { path: 'package.json', text: fileDiff('package.json', '+"react": "^19.0.0"'), before: manifest('^18.3.1'), after: manifest('^19.0.0') },
    { path: 'src/a.ts', text: fileDiff('src/a.ts', '+a()') },
  ]))
  on('http.fetch', () => ({ value: jevAnswer(2, 0) }))
  const slices = [{ title: 'React 19', files: ['package.json'] }, { title: 'A', files: ['src/a.ts'] }]
  const report = JSON.parse((await $.tool.call({ tool: TOOL, base: 'main', slices })).result)
  expect(report.slices.map((s) => s.likelihood.level)).toEqual(['non-trivial', 'mechanical'])
  expect(report.slices[0].adjustments).toContain(
    'likelihood raised to non-trivial: the slice moves a runtime dependency to a new major version, whose changes lie outside the diff',
  )
})

test('finds major bumps of runtime dependencies only', () => {
  const pkg = (deps: Record<string, string>, dev: Record<string, string> = {}) => JSON.stringify({ dependencies: deps, devDependencies: dev })
  expect(majorBumps('package.json', pkg({ react: '^18.3.1' }), pkg({ react: '^19.0.0' }))).toEqual(['react ^18.3.1 → ^19.0.0'])
  expect(majorBumps('apps/web/package.json', pkg({ zod: '0.3.1' }), pkg({ zod: '0.4.0' }))).toEqual(['zod 0.3.1 → 0.4.0'])
  expect(majorBumps('package.json', pkg({ react: '^18.2.0' }), pkg({ react: '^18.3.1' }))).toEqual([])
  expect(majorBumps('package.json', pkg({}, { vitest: '^3.0.0' }), pkg({}, { vitest: '^4.0.0' }))).toEqual([])
  expect(majorBumps('package.json', pkg({ ui: 'workspace:^1.0.0' }), pkg({ ui: 'workspace:^2.0.0' }))).toEqual([])
  expect(majorBumps('package.json', 'not json', pkg({ react: '^19.0.0' }))).toEqual([])

  const lock = (v: string) => `provider "registry.terraform.io/cloudflare/cloudflare" {\n  version     = "${v}"\n  constraints = "~> ${v}"\n}\n`
  expect(majorBumps('infra/.terraform.lock.hcl', lock('4.52.0'), lock('5.1.0'))).toEqual(['registry.terraform.io/cloudflare/cloudflare 4.52.0 → 5.1.0'])
  const tf = (v: string) => `terraform {\n  required_providers {\n    aws = {\n      source  = "hashicorp/aws"\n      version = "~> ${v}"\n    }\n  }\n}\n`
  expect(majorBumps('infra/versions.tf', tf('5.0'), tf('6.0'))).toEqual(['hashicorp/aws ~> 5.0 → ~> 6.0'])
  expect(majorBumps('go.mod', 'require github.com/a/b v1.4.0\n', 'require github.com/a/b/v2 v2.0.1\n')).toEqual(['github.com/a/b 1.4.0 → 2.0.1'])
  expect(majorBumps('requirements.txt', 'Django==4.2.1\n', 'Django==5.0\n')).toEqual(['django 4.2.1 → 5.0'])
  expect(majorBumps('pyproject.toml', '[project]\ndependencies = ["fastapi[all]>=0.110"]\n', '[project]\ndependencies = ["fastapi[all]>=0.115"]\n')).toEqual(['fastapi 0.110 → 0.115'])
  expect(majorBumps('charts/app/Chart.yaml', 'dependencies:\n  - name: redis\n    version: 18.1.0\n', 'dependencies:\n  - name: redis\n    version: 19.0.0\n')).toEqual(['redis 18.1.0 → 19.0.0'])

  expect(['package.json', 'requirements.txt', 'infra/.terraform.lock.hcl'].every(isDependencyManifest)).toBe(true)
  expect(['requirements-dev.txt', 'pnpm-lock.yaml', 'src/package.ts'].some(isDependencyManifest)).toBe(false)
})

test('only the calibrated policy raises a slice for a major bump', () => {
  const statuses = new Map([['package.json', { status: 'modified' as const, added: 1, deleted: 1, majorBumps: ['react ^18.3.1 → ^19.0.0'] }]])
  const slice = (policy: 'calibrated-v1' | 'evidence-v1') => aggregate(
    [{ model: 'jev', answers: answers(2, 0), slice: 0 }],
    [{ group: 0, answers: answers(0, 0) }], readConfig({}),
    [{ title: 'Deps', files: ['package.json'] }], ['package.json'], statuses, new Set(), true, policy,
  ).slices[0]
  expect(slice('calibrated-v1').likelihood.level).toBe('non-trivial')
  expect(slice('evidence-v1').likelihood.level).toBe('mechanical')
})

test('reads renames, additions and deletions from git name-status', () => {
  const statuses = fileStatuses('R087\0a.ts\0b.ts\0A\0new.ts\0D\0gone.ts\0M\0kept.ts\0', [
    { path: 'new.ts', added: 5, deleted: 0 },
  ])
  expect(statuses.get('a.ts')).toEqual({ status: 'renamed', to: 'b.ts', similarity: 87, added: 0, deleted: 0 })
  expect(statuses.get('b.ts')?.from).toBe('a.ts')
  expect(statuses.get('new.ts')).toEqual({ status: 'added', added: 5, deleted: 0 })
  expect(statuses.get('gone.ts')?.status).toBe('deleted')
  expect(statuses.get('kept.ts')?.status).toBe('modified')
})

test('folds a bulk import into one line of totals', () => {
  const paths = Array.from({ length: 2000 }, (_, i) => `vendor/pkg/file-${i}.ts`)
  const statuses = fileStatuses(paths.map((p) => `A\0${p}\0`).join(''), paths.map((path) => ({ path, added: 3, deleted: 0 })))
  const state = intentState({ files: paths }, statuses, { commits: 'abc import' }, [])
  const last = state.files[state.files.length - 1]
  expect(JSON.stringify(state).length < 30_000).toBe(true)
  expect(last).toMatch(/^… and \d+ more files: \+\d+ -0$/)
  expect(Number(last.match(/and (\d+)/)![1]) + state.files.length - 1).toBe(2000)
})

test('keeps prose apart from the code diff, except agent instructions', () => {
  const doc = fileDiff('docs/guide.md', '+Removed the legacy endpoints')
  const changeset = fileDiff('.changeset/x.md', '+minor')
  const rule = fileDiff('.claude/rules/api.md', '+Always paginate')
  const code = fileDiff('src/api.ts', '+route()')
  const state = partState({ files: [], diff: [doc, code, changeset, rule].join('\n') }, 'S')
  expect(state.diff).toBe([code, rule].join('\n'))
  expect(state.prose).toBe([doc, changeset].join('\n'))
  expect('prose' in partState({ files: [], diff: code })).toBe(false)
})
