import { expect, mock, test } from 'claude-code/testing'
import { endpointUrl, fileDiffs } from '../hooks/jev.ts'
import { FACTS, aggregate, factQuestions, partState, signalOf } from '../hooks/signals.ts'

const TOOL = 'mcp__pr-proof__proof_signals'

type File = { path: string; text?: string; binary?: boolean }

const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } })

const fileDiff = (path: string, body: string) =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,1 +1,2 @@\n${body}`

function fakeProcess(files: File[], sleeps: string[][] = []) {
  return ($, e) => {
    const argv: string[] = e.argv
    if (argv[0] === 'sleep') {
      sleeps.push(argv)
      return ok('')
    }
    const args = argv.slice(1)
    if (args[1] === '--show-toplevel') return ok('/work\n')
    if (args[0] === 'rev-parse') return { value: { exitCode: args[3] === 'origin/main^{commit}' ? 0 : 1, stdout: '', stderr: '' } }
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

function jevFailure(status: number, text: string, headers: Record<string, string> = {}) {
  return { status, ok: false, headers, text }
}

const UI_CHANGE = [{ path: 'src/Login.tsx', text: fileDiff('src/Login.tsx', '+<Button color="blue" />') }]

for (const { env, expected } of [
  { env: { TYPESAFE_API_KEY: 'secret' }, expected: ['proof_signals'] },
  { env: {}, expected: [] },
]) {
  test(`registers ${JSON.stringify(expected)} with the environment ${JSON.stringify(env)}`, async ($, on) => {
    mock.env(on, env)
    const registered: string[] = []
    on('tool.register', ($, e) => {
      registered.push(e.name)
      return { value: { tool: TOOL } }
    })
    on('session.start', () => ({ cwd: '/work' }))

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

    expect(registered).toEqual(expected)
  })
}

test('builds the endpoint URL from a base with or without the systemone path', () => {
  expect(endpointUrl(undefined)).toBe('https://api.typesafe.ai/v1/systemone')
  expect(endpointUrl('https://x.test/')).toBe('https://x.test/v1/systemone')
  expect(endpointUrl('https://x.test/v1/systemone')).toBe('https://x.test/v1/systemone')
})

test('splits and names a file whose quoted header git kept despite core.quotePath=false', () => {
  const quoted = 'diff --git "a/say \\"hi\\"\\\\\\tż.txt" "b/say \\"hi\\"\\\\\\tż.txt"\n+x'
  const files = fileDiffs(`diff --git a/plain.txt b/plain.txt\n+y\n${quoted}`)
  expect(files.map((f) => f.path)).toEqual(['plain.txt', 'say "hi"\\\tż.txt'])
  expect(files[1].text).toBe(quoted)
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
  const state = partState({ files: ['src/a.ts', 'docs/guide.md', 'CLAUDE.md'], diff }, { diffstat: 'stat' })
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
  expect(body.state.commits).toBe('')
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
    if (e.argv.includes('diff')) diffs.push(e.argv)
    return git($, e)
  })
  on('http.fetch', () => ({ value: jevAnswer() }))

  await $.tool.call({ tool: TOOL, base: 'main' })

  expect(diffs.length).toBe(3)
  expect(diffs.every((argv) => argv.includes('--no-relative'))).toBe(true)
})

test('runs git in the repository the session started in when its working directory left it', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  const git = fakeProcess(UI_CHANGE)
  const cwds = new Set<unknown>()
  on('process.run', ($, e) => {
    if (e.argv[2] !== '--show-toplevel') {
      cwds.add(e.init?.cwd)
      return git($, e)
    }
    return e.init?.cwd === '/start' ? ok('/work\n') : { value: { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' } }
  })
  on('session.root', () => ({ value: '/start' }))
  on('http.fetch', () => ({ value: jevAnswer() }))

  const out = await $.tool.call({ tool: TOOL, base: 'main' })

  expect(out.result).not.toMatch(/unavailable/)
  expect([...cwds]).toEqual(['/work'])
})

test('reports a session outside any git repository as unavailable', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  on('process.run', () => ({ value: { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' } }))
  on('session.root', () => ({ value: '/start' }))
  on('session.cwd', () => ({ value: '/tmp/scratchpad' }))

  const out = await $.tool.call({ tool: TOOL, base: 'main' })

  expect(out.result).toBe(
    "Proof signals unavailable: neither the session's working directory (/tmp/scratchpad) nor the directory it started in (/start) is in a git repository",
  )
})

test('reports a rejected key as unavailable', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'bad' })
  on('process.run', fakeProcess(UI_CHANGE))
  on('http.fetch', () => ({ value: jevFailure(401, 'unauthorized') }))

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
  on('process.run', ($, e) =>
    e.argv.includes('diff') ? { value: { exitCode: 128, stdout: '', stderr: 'fatal: bad revision' } } : ok('/work\n'),
  )

  const out = await $.tool.call({ tool: TOOL, base: 'main' })

  expect(out.result).toMatch(/^Proof signals unavailable: git diff failed: fatal: bad revision/)
})

for (const base of ['--output=/tmp/x', 'main..evil']) {
  test(`refuses the base ${base}, which git could read as an option or a range`, async ($, on) => {
    mock.env(on, { TYPESAFE_API_KEY: 'secret' })

    const out = await $.tool.call({ tool: TOOL, base })

    expect(out.result).toMatch(/^Proof signals unavailable: `base` must be a branch name/)
  })
}

for (const { name, files, reason } of [
  { name: 'only lockfiles', files: [{ path: 'pnpm-lock.yaml', text: fileDiff('pnpm-lock.yaml', '+lock') }], reason: /no reviewable text files/ },
  { name: 'no files', files: [], reason: /no changes between origin\/main and HEAD/ },
  { name: 'only an empty diff', files: [{ path: 'run.sh', text: '' }], reason: /no reviewable text diff: only mode changes or empty files/ },
]) {
  test(`reports a change of ${name} as unavailable`, async ($, on) => {
    mock.env(on, { TYPESAFE_API_KEY: 'secret' })
    on('process.run', fakeProcess(files))

    const out = await $.tool.call({ tool: TOOL, base: 'main' })

    expect(out.result).toMatch(new RegExp('^Proof signals unavailable: ' + reason.source))
  })
}

test('waits for a retry in a sleep process, not on the clock', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  const sleeps: string[][] = []
  on('process.run', fakeProcess(UI_CHANGE, sleeps))
  let clockSleeps = 0
  on('clock.sleep', () => {
    clockSleeps += 1
    return { value: undefined }
  })
  let calls = 0
  on('http.fetch', () => {
    calls += 1
    return { value: calls === 1 ? jevFailure(503, 'unavailable') : jevAnswer({ appearance_changed: 0.9 }) }
  })

  const out = await $.tool.call({ tool: TOOL, base: 'main' })

  expect(calls).toBe(2)
  expect(sleeps).toEqual([['sleep', '1']])
  expect(clockSleeps).toBe(0)
  expect(out.result).not.toContain('unavailable')
  expect(JSON.parse(out.result).signals.screenshots.signal).toBe('suggest')
})

for (const { retryAfter, seconds } of [
  { retryAfter: '0.5', seconds: '0.5' },
  { retryAfter: '30', seconds: '10' },
  { retryAfter: '0', seconds: '1' },
]) {
  test(`waits ${seconds} s for a retry-after of ${retryAfter}`, async ($, on) => {
    mock.env(on, { TYPESAFE_API_KEY: 'secret' })
    const sleeps: string[][] = []
    on('process.run', fakeProcess(UI_CHANGE, sleeps))
    let calls = 0
    on('http.fetch', () => {
      calls += 1
      return { value: calls === 1 ? jevFailure(503, 'unavailable', { 'retry-after': retryAfter }) : jevAnswer() }
    })

    const out = await $.tool.call({ tool: TOOL, base: 'main' })

    expect(sleeps).toEqual([['sleep', seconds]])
    expect(JSON.parse(out.result).model).toBe('jev-1.14.0')
  })
}

test('gives up after three attempts at a request that keeps failing', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  const sleeps: string[][] = []
  on('process.run', fakeProcess(UI_CHANGE, sleeps))
  let calls = 0
  on('http.fetch', () => {
    calls += 1
    return { value: jevFailure(503, 'unavailable') }
  })

  const out = await $.tool.call({ tool: TOOL, base: 'main' })

  expect(calls).toBe(3)
  expect(sleeps).toEqual([['sleep', '1'], ['sleep', '2']])
  expect(out.result).toMatch(/^Proof signals unavailable: TypeSafe answered HTTP 503/)
})

test('cuts a hunk longer than the budget and marks the coverage partial', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  on('process.run', fakeProcess([{ path: 'big.ts', text: fileDiff('big.ts', '+x'.repeat(40_000)) }]))
  on('http.fetch', () => ({ value: jevAnswer() }))

  const report = JSON.parse((await $.tool.call({ tool: TOOL, base: 'main' })).result)

  expect(report.coverage).toEqual({ parts: 1, filesNotAssessed: 0, filesExcluded: 0, truncatedHunks: 1, partial: true })
})

test('reports the files beyond the request cap as not assessed', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  const files = Array.from({ length: 10 }, (_, i) => ({ path: `f${i}.ts`, text: fileDiff(`f${i}.ts`, '+x'.repeat(30_000)) }))
  on('process.run', fakeProcess(files))
  let requests = 0
  on('http.fetch', () => {
    requests += 1
    return { value: jevAnswer() }
  })

  const report = JSON.parse((await $.tool.call({ tool: TOOL, base: 'main' })).result)

  expect(requests).toBe(8)
  expect(report.coverage).toEqual({ parts: 8, filesNotAssessed: 2, filesExcluded: 0, truncatedHunks: 0, partial: true })
})

test('stops halving at the split depth when every request is too long', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  const files = Array.from({ length: 16 }, (_, i) => ({ path: `f${i}.ts`, text: fileDiff(`f${i}.ts`, '+x'.repeat(500)) }))
  on('process.run', fakeProcess(files))
  let requests = 0
  on('http.fetch', () => {
    requests += 1
    return { value: jevFailure(400, '{"error":{"code":"max_tokens_exceeded"}}') }
  })

  const out = await $.tool.call({ tool: TOOL, base: 'main' })

  expect(requests).toBe(4)
  expect(out.result).toBe(
    'Proof signals unavailable: A request was longer than the Jev model accepts (HTTP 400 max_tokens_exceeded).',
  )
})

test('halves a part Jev refuses as too long and aggregates the halves', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  on('process.run', fakeProcess([{ path: 'a.ts', text: fileDiff('a.ts', '+a'.repeat(4000)) }, { path: 'b.ts', text: fileDiff('b.ts', '+b'.repeat(4000)) }]))
  let requests = 0
  on('http.fetch', ($, e) => {
    requests += 1
    const { diff } = JSON.parse(e.init.body).state
    if (diff.length > 10_000) return { value: jevFailure(400, '{"error":{"code":"max_tokens_exceeded"}}') }
    return { value: jevAnswer(diff.includes('+b') ? { command_output_changed: 0.8, no_behavior_change: 0.1 } : { no_behavior_change: 0.9 }) }
  })

  const report = JSON.parse((await $.tool.call({ tool: TOOL, base: 'main' })).result)

  expect(requests).toBe(3)
  expect(report.coverage.parts).toBe(2)
  expect(report.signals.terminal).toEqual({ signal: 'suggest', p: 0.8 })
  expect(report.noBehaviorChange).toEqual({ signal: 'reject', p: 0.1 })
  expect(report.suppressed).toBe(false)
})
