import { expect, mock, test } from 'claude-code/testing'
import { FACTS, aggregate, factQuestions, partState, signalOf } from '../hooks/signals.ts'

const TOOL = 'mcp__pr-proof__proof_signals'

type File = { path: string; text?: string; binary?: boolean }

const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } })

const fileDiff = (path: string, body: string) =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,1 +1,2 @@\n${body}`

// Records every `sleep` the retry wait runs, so a test can read its argv.
function fakeProcess(files: File[], sleeps: string[][] = []) {
  return ($, e) => {
    const argv: string[] = e.argv
    if (argv[0] === 'sleep') {
      sleeps.push(argv)
      return ok('')
    }
    const args = argv.slice(1)
    if (args[0] === 'rev-parse') return { value: { exitCode: args[3] === 'origin/main^{commit}' ? 0 : 1, stdout: '', stderr: '' } }
    if (args[0] === 'log') return ok('abc123 feat: restyle the login page\n')
    if (args.includes('--stat=200')) return ok(files.map((f) => ` ${f.path} | 1 +`).join('\n'))
    if (args.includes('--numstat')) return ok(files.map((f) => `${f.binary ? '-' : '1'}\t${f.binary ? '-' : '0'}\t${f.path}\0`).join(''))
    const pathspec = args[args.length - 1]
    return ok(files.find((f) => pathspec === `:(top,literal)${f.path}`)?.text ?? '')
  }
}

type Facts = Partial<Record<keyof typeof FACTS, number>>

function jevAnswer(facts: Facts = {}) {
  const answers = Object.fromEntries(Object.keys(FACTS).map((key) => [key, { type: 'noul', noul: facts[key] ?? 0.1 }]))
  return { status: 200, ok: true, headers: {}, text: JSON.stringify({ model: 'jev-1.14.0', answers, usage: {} }) }
}

const UI_CHANGE = [{ path: 'src/Login.tsx', text: fileDiff('src/Login.tsx', '+<Button color="blue" />') }]

test('registers the tool only when a key is set', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  const registered: string[] = []
  on('tool.register', ($, e) => {
    registered.push(e.name)
    return { value: { tool: TOOL } }
  })
  on('session.start', () => ({ cwd: '/work' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(registered).toEqual(['proof_signals'])
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

test('reads a probability at the thresholds as suggest or reject', () => {
  expect(signalOf(0.7)).toBe('suggest')
  expect(signalOf(0.69)).toBe('uncertain')
  expect(signalOf(0.31)).toBe('uncertain')
  expect(signalOf(0.3)).toBe('reject')
  expect(signalOf(0)).toBe('reject')
  expect(signalOf(1)).toBe('suggest')
})

test('asks the five facts as noul questions', () => {
  const q = factQuestions() as Record<string, { type: string; instructions: string }>
  expect(Object.keys(q)).toEqual(['appearance_changed', 'ui_flow_changed', 'endpoint_response_changed', 'command_output_changed', 'no_behavior_change'])
  expect(Object.values(q).every((x) => x.type === 'noul')).toBe(true)
})

test('takes the maximum across parts for a kind and the minimum for no behaviour change', () => {
  const part = (f: Record<string, number>) => Object.fromEntries(Object.entries(f).map(([k, noul]) => [k, { noul }]))
  const result = aggregate([
    part({ appearance_changed: 0.9, ui_flow_changed: 0.2, endpoint_response_changed: 0.1, command_output_changed: 0.5, no_behavior_change: 0.95 }),
    part({ appearance_changed: 0.1, ui_flow_changed: 0.4, endpoint_response_changed: 0.2, command_output_changed: 0.1, no_behavior_change: 0.2 }),
  ])
  expect(result.signals).toEqual({
    screenshots: { signal: 'suggest', p: 0.9 },
    video: { signal: 'uncertain', p: 0.4 },
    api: { signal: 'reject', p: 0.2 },
    terminal: { signal: 'uncertain', p: 0.5 },
  })
  expect(result.noBehaviorChange).toEqual({ signal: 'reject', p: 0.2 })
  expect(result.suppressed).toBe(false)
})

test('a change without behaviour in any part suppresses the kinds but keeps their values', () => {
  const answers = { appearance_changed: { noul: 0.8 }, ui_flow_changed: { noul: 0.1 }, endpoint_response_changed: { noul: 0.1 }, command_output_changed: { noul: 0.1 }, no_behavior_change: { noul: 0.75 } }
  const result = aggregate([answers, { ...answers, no_behavior_change: { noul: 0.9 } }])
  expect(result.suppressed).toBe(true)
  expect(result.noBehaviorChange).toEqual({ signal: 'suggest', p: 0.75 })
  expect(result.signals.screenshots).toEqual({ signal: 'suggest', p: 0.8 })
})

test('puts prose apart from the diff, keeping agent instructions in it', () => {
  const diff = [fileDiff('src/a.ts', '+a()'), fileDiff('docs/guide.md', '+guide'), fileDiff('CLAUDE.md', '+rule')].join('\n')
  const state = partState({ files: ['src/a.ts', 'docs/guide.md', 'CLAUDE.md'], diff }, { commits: 'abc fix', diffstat: 'stat' })
  expect(state.commits).toBe('abc fix')
  expect(state.diffstat).toBe('stat')
  expect(state.diff).toContain('+a()')
  expect(state.diff).toContain('+rule')
  expect(state.diff).not.toContain('+guide')
  expect(state.prose).toContain('+guide')
})

test('asks about the diff without lockfiles and binaries and returns signals', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  on(
    'process.run',
    fakeProcess([...UI_CHANGE, { path: 'pnpm-lock.yaml', text: fileDiff('pnpm-lock.yaml', '+lock') }, { path: 'logo.png', binary: true }]),
  )
  const requests: { url: string; init: { headers: Record<string, string>; body: string } }[] = []
  on('http.fetch', ($, e) => {
    requests.push(e)
    return { value: jevAnswer({ appearance_changed: 0.92, ui_flow_changed: 0.5 }) }
  })

  const out = await $.tool.call({ tool: TOOL, base: 'main' })
  const report = JSON.parse(out.result)
  const body = JSON.parse(requests[0].init.body)

  expect(requests.length).toBe(1)
  expect(requests[0].url).toBe('https://api.typesafe.ai/v1/systemone')
  expect(requests[0].init.headers.authorization).toBe('Bearer secret')
  expect(body.model).toBe('jev-1.14.0')
  expect(Object.keys(body.state).sort()).toEqual(['commits', 'diff', 'diffstat', 'files'])
  expect(body.state.commits).toContain('restyle the login page')
  expect(body.state.files).toEqual(['src/Login.tsx'])
  expect(body.state.diff).toContain('Button')
  expect(body.state.diff).not.toContain('pnpm-lock.yaml')
  expect(Object.keys(body.questions).length).toBe(5)

  expect(report.model).toBe('jev-1.14.0')
  expect(report.signals.screenshots).toEqual({ signal: 'suggest', p: 0.92 })
  expect(report.signals.video).toEqual({ signal: 'uncertain', p: 0.5 })
  expect(report.signals.api.signal).toBe('reject')
  expect(report.signals.terminal.signal).toBe('reject')
  expect(report.noBehaviorChange).toEqual({ signal: 'reject', p: 0.1 })
  expect(report.suppressed).toBe(false)
  expect(report.coverage).toEqual({ parts: 1, filesNotAssessed: 0, filesExcluded: 2, truncatedHunks: 0, partial: false })
})

test('runs every git diff without diff.relative', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  const diffs: string[][] = []
  const git = fakeProcess(UI_CHANGE)
  on('process.run', ($, e) => {
    if (e.argv[1] === 'diff') diffs.push(e.argv)
    return git($, e)
  })
  on('http.fetch', () => ({ value: jevAnswer() }))
  await $.tool.call({ tool: TOOL, base: 'main' })
  expect(diffs.length).toBe(3)
  expect(diffs.every((argv) => argv.includes('--no-relative'))).toBe(true)
})

test('reports a rejected key as unavailable', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'bad' })
  on('process.run', fakeProcess(UI_CHANGE))
  on('http.fetch', () => ({ value: { status: 401, ok: false, headers: {}, text: 'unauthorized' } }))
  const out = await $.tool.call({ tool: TOOL, base: 'main' })
  expect(out.result).toMatch(/^Proof signals unavailable: TypeSafe rejected the API key \(HTTP 401\)/)
})

test('reports an answer without a number as unavailable', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  on('process.run', fakeProcess(UI_CHANGE))
  on('http.fetch', () => ({ value: jevAnswer({ ui_flow_changed: Number.NaN }) }))
  const out = await $.tool.call({ tool: TOOL, base: 'main' })
  expect(out.result).toMatch(/^Proof signals unavailable: TypeSafe returned no numeric answer for "ui_flow_changed"/)
})

test('reports a git failure as unavailable', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: 'fatal: not a git repository' } }))
  const out = await $.tool.call({ tool: TOOL, base: 'main' })
  expect(out.result).toMatch(/^Proof signals unavailable: base branch "main" not found/)
})

test('refuses a base that git could read as an option', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  const out = await $.tool.call({ tool: TOOL, base: '--output=/tmp/x' })
  expect(out.result).toMatch(/^Proof signals unavailable: `base` must be a branch name/)
})

test('reports a change of only lockfiles as unavailable', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  on('process.run', fakeProcess([{ path: 'pnpm-lock.yaml', text: fileDiff('pnpm-lock.yaml', '+lock') }]))
  const out = await $.tool.call({ tool: TOOL, base: 'main' })
  expect(out.result).toMatch(/^Proof signals unavailable: no reviewable text files/)
})

test('waits for a retry in a sleep process, not on the clock', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  const sleeps: string[][] = []
  on('process.run', fakeProcess(UI_CHANGE, sleeps))
  let calls = 0
  on('http.fetch', () => {
    calls += 1
    return { value: calls === 1 ? { status: 503, ok: false, headers: {}, text: 'unavailable' } : jevAnswer({ appearance_changed: 0.9 }) }
  })

  const out = await $.tool.call({ tool: TOOL, base: 'main' })

  expect(calls).toBe(2)
  expect(sleeps).toEqual([['sleep', '1']])
  expect(out.result).not.toContain('unavailable')
  expect(JSON.parse(out.result).signals.screenshots.signal).toBe('suggest')
})

test('waits a fractional retry-after in seconds', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  const sleeps: string[][] = []
  on('process.run', fakeProcess(UI_CHANGE, sleeps))
  let calls = 0
  on('http.fetch', () => {
    calls += 1
    return { value: calls === 1 ? { status: 503, ok: false, headers: { 'retry-after': '0.5' }, text: 'unavailable' } : jevAnswer() }
  })

  const out = await $.tool.call({ tool: TOOL, base: 'main' })

  expect(sleeps).toEqual([['sleep', '0.5']])
  expect(JSON.parse(out.result).model).toBe('jev-1.14.0')
})

test('halves a part Jev refuses as too long and aggregates the halves', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  on('process.run', fakeProcess([{ path: 'a.ts', text: fileDiff('a.ts', '+a'.repeat(4000)) }, { path: 'b.ts', text: fileDiff('b.ts', '+b'.repeat(4000)) }]))
  let requests = 0
  on('http.fetch', ($, e) => {
    requests += 1
    const { diff } = JSON.parse(e.init.body).state
    if (diff.length > 10_000) return { value: { status: 400, ok: false, headers: {}, text: '{"error":{"code":"max_tokens_exceeded"}}' } }
    return { value: jevAnswer(diff.includes('+b') ? { command_output_changed: 0.8, no_behavior_change: 0.1 } : { no_behavior_change: 0.9 }) }
  })

  const report = JSON.parse((await $.tool.call({ tool: TOOL, base: 'main' })).result)

  expect(requests).toBe(3)
  expect(report.coverage.parts).toBe(2)
  expect(report.signals.terminal).toEqual({ signal: 'suggest', p: 0.8 })
  expect(report.noBehaviorChange).toEqual({ signal: 'reject', p: 0.1 })
  expect(report.suppressed).toBe(false)
})
