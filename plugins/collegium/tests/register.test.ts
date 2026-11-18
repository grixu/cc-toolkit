import { expect, mock, test } from 'claude-code/testing'
import { CALLER, ENVELOPE, NOW, ROOT, exit, notice, ok, removeUnder, type End } from './host.ts'

const RUN = 'mcp__collegium__collegium_run'
const STATUS = 'mcp__collegium__collegium_status'
const RESULT = 'mcp__collegium__collegium_result'

const SEEDED = '20261118T080000-abc123'
const LIVE_PID = 4242

const MODELS = JSON.stringify({
  models: [
    { slug: 'gpt-6.1-sol', visibility: 'list', default_reasoning_level: 'medium', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'medium' }, { effort: 'high' }] },
    { slug: 'gpt-6-luna', visibility: 'list', default_reasoning_level: 'low', supported_reasoning_levels: [{ effort: 'low' }] },
  ],
})
const TERMINAL_TURN = { answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const

type Submit = 'accept' | 'drop'
type Options = {
  files?: Record<string, string>
  installed?: boolean
  loggedIn?: boolean
  submits?: Submit[]
  watcher?: 'timeout' | 'ends'
}

function seededState(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: SEEDED,
    harness: 'codex',
    model: 'openai/gpt-6.1-sol',
    effort: 'high',
    chosenBy: 'caller',
    mode: 'read-only',
    cwd: CALLER,
    startedAt: NOW - 90_000,
    deadline: NOW - 90_000 + 60 * 60_000,
    pid: LIVE_PID,
    state: 'running',
    exitCode: null,
    ...extra,
  })
}

function host(on, o: Options = {}) {
  const files: Record<string, string> = { ...o.files }
  const runs: { argv: string[]; init?: Record<string, unknown> }[] = []
  const spawned: Record<string, any>[] = []
  const submitted: string[] = []
  const answers = [...(o.submits ?? [])]
  let finish: (end: End) => void = () => {}
  const ended = new Promise<End>((resolve) => (finish = resolve))

  mock.env(on, {})
  mock.store(on)
  const clock = mock.clock(on, { now: NOW })
  on('session.root', () => ({ value: CALLER }))
  on('process.hookEnv', () => ({ value: { CLAUDE_PLUGIN_DATA: '/data', CLAUDE_PROJECT_DIR: CALLER } }))
  on('fs.read', ($, e) => {
    if (!(e.path in files)) return { deny: `ENOENT: ${e.path}` }
    const text = files[e.path]
    const offset = e.offset ?? 0
    const length = e.length ?? text.length
    return { value: text.slice(offset, offset + length) }
  })
  on('fs.write', ($, e) => {
    files[e.path] = e.text
    return { value: undefined }
  })
  on('fs.exists', ($, e) => ({ value: Object.keys(files).some((k) => k === e.path || k.startsWith(`${e.path}/`)) }))
  on('fs.stat', ($, e) => (e.path in files ? { value: { kind: 'file', size: files[e.path].length } } : { deny: `ENOENT: ${e.path}` }))
  on('fs.list', ($, e) => {
    const names = new Set<string>()
    for (const key of Object.keys(files)) if (key.startsWith(`${e.path}/`)) names.add(key.slice(e.path.length + 1).split('/')[0])
    if (names.size === 0) return { deny: `ENOENT: ${e.path}` }
    return { value: [...names].map((name) => ({ name, kind: 'directory', size: 0, mtimeMs: 0, isLink: false })) }
  })
  on('process.run', ($, e) => {
    const argv: string[] = e.argv
    runs.push({ argv, init: e.init })
    const args = argv.slice(1).join(' ')
    if (argv[0] === 'git' && args === 'rev-parse --show-toplevel') return ok(`${CALLER}\n`)
    if (argv[0] === 'codex' && args === '--version') return o.installed === false ? { deny: 'spawn codex ENOENT' } : ok('codex-cli 0.130.0\n')
    if (argv[0] === 'codex' && args === 'login status') return exit(o.loggedIn === false ? 1 : 0)
    if (argv[0] === 'codex' && args === 'debug models') return ok(MODELS)
    if (argv[0] === 'kill' && argv[1] === '-0') return exit(Number(argv[2]) === LIVE_PID ? 0 : 1)
    if (argv[0] === 'rm') {
      removeUnder(files, argv[2])
      return ok()
    }
    if (argv[0] === 'sh') {
      if (o.watcher === 'timeout') return { deny: 'the command was still running at its timeout' }
      const runDir = e.init?.cwd
      files[`${runDir}/exit`] = '0\n'
      files[`${runDir}/state.json`] = seededState({ state: 'done', exitCode: 0, envelope: ENVELOPE })
      return ok()
    }
    return ok()
  })
  on('process.spawn', async function* ($, e) {
    spawned.push(e)
    const end = await ended
    files[`${e.cwd}/last.json`] = JSON.stringify(ENVELOPE)
    return { value: end }
  })
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    if ((answers.shift() ?? 'accept') === 'drop') return { drop: 'the session was stopped and nobody has sent input since' }
    return { text: e.text, origin: e.origin }
  })
  on('turn.complete', () => ({ text: '' }))
  return { files, runs, spawned, submitted, clock, finish: (end: End = { code: 0, signal: null }) => finish(end) }
}

const launched = (h: ReturnType<typeof host>) => h.spawned.length > 0
const codexCalls = (h: ReturnType<typeof host>, sub: string) => h.runs.filter((r) => r.argv[0] === 'codex' && r.argv.slice(1).join(' ') === sub)

async function settle(h: ReturnType<typeof host>, until: () => boolean) {
  for (let i = 0; i < 50 && !until(); i++) await h.clock.advance(0)
}

test('registers the three tools at session start', async ($, on) => {
  const registered: { name: string; inputSchema: any }[] = []
  on('tool.register', ($, e) => {
    registered.push(e)
    return { value: { tool: `mcp__collegium__${e.name}` } }
  })
  on('session.start', () => ({ cwd: CALLER }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: CALLER })

  expect(registered.map((t) => t.name)).toEqual(['collegium_run', 'collegium_status', 'collegium_result'])
  expect(registered[0].inputSchema.required).toEqual(['task'])
  expect(registered[0].inputSchema.properties.write.enum).toEqual(['worktree', 'branch', 'merge'])
  expect(registered[2].inputSchema.properties.wait_seconds.maximum).toBe(600)
})

test('a detected Codex that is not enabled is refused with the enable instruction', async ($, on) => {
  const h = host(on)
  const out = await $.tool.call({ tool: RUN, task: 'Review it.' })

  expect(out.result).toBe('Codex detected, enable it in /plugin configure.')
  expect(launched(h)).toBe(false)
})

test('a missing Codex is refused before the enablement check', async ($, on) => {
  const h = host(on, { installed: false })
  const out = await $.tool.call({ tool: RUN, task: 'Review it.' })

  expect(out.result).toContain('Codex is not installed')
  expect(out.result).not.toContain('enable it')
  expect(launched(h)).toBe(false)
})

test('a project config that disables Codex is refused even with the option on', { options: { codex: true } }, async ($, on) => {
  const h = host(on, { files: { [`${CALLER}/.claude/collegium.json`]: JSON.stringify({ harnesses: { disabled: ['codex'] } }) } })
  const out = await $.tool.call({ tool: RUN, task: 'Review it.' })

  expect(out.result).toContain('harnesses.disabled')
  expect(launched(h)).toBe(false)
})

test('an invalid config file is a config error naming the file', { options: { codex: true } }, async ($, on) => {
  const h = host(on, { files: { [`${CALLER}/.claude/collegium.json`]: '{ not json' } })
  const out = await $.tool.call({ tool: RUN, task: 'Review it.' })

  expect(out.result).toContain('config error')
  expect(out.result).toContain(`${CALLER}/.claude/collegium.json`)
  expect(launched(h)).toBe(false)
})

test('a logged-out Codex is refused with the login instruction', { options: { codex: true } }, async ($, on) => {
  const h = host(on, { loggedIn: false })
  const out = await $.tool.call({ tool: RUN, task: 'Review it.', model: 'openai/gpt-6.1-sol', effort: 'high' })

  expect(out.result).toContain('! codex login')
  expect(launched(h)).toBe(false)
})

test('a result schema that breaks strict mode is refused before Codex is asked anything', { options: { codex: true } }, async ($, on) => {
  const h = host(on)
  const out = await $.tool.call({ tool: RUN, task: 'Review it.', result_schema: { type: 'object', properties: { a: { type: 'string' } } } })

  expect(out.result).toContain('invalid result_schema')
  expect(codexCalls(h, '--version')).toHaveLength(0)
  expect(launched(h)).toBe(false)
})

test('an unknown model and an unknown effort are refused', { options: { codex: true } }, async ($, on) => {
  const h = host(on)
  const model = await $.tool.call({ tool: RUN, task: 'Review it.', model: 'openai/gpt-0', effort: 'high' })
  const effort = await $.tool.call({ tool: RUN, task: 'Review it.', model: 'openai/gpt-6-luna', effort: 'max' })

  expect(model.result).toContain('unknown model openai/gpt-0')
  expect(effort.result).toContain('has no effort max')
  expect(launched(h)).toBe(false)
})

test('a relative cwd is refused', { options: { codex: true } }, async ($, on) => {
  const h = host(on)
  const out = await $.tool.call({ tool: RUN, task: 'Review it.', cwd: 'repo' })

  expect(out.result).toBe('cwd must be an absolute path')
  expect(launched(h)).toBe(false)
})

test('an unknown write mode and a timeout under a minute are refused', { options: { codex: true } }, async ($, on) => {
  const h = host(on)
  const write = await $.tool.call({ tool: RUN, task: 'Review it.', write: 'rebase' })
  const timeout = await $.tool.call({ tool: RUN, task: 'Review it.', timeout_minutes: 0 })

  expect(write.result).toBe('unknown write mode rebase; use one of worktree, branch, merge')
  expect(timeout.result).toBe('timeout_minutes must be a number of at least 1')
  expect(launched(h)).toBe(false)
})

test('a run starts at once, returns its id and runs Codex read-only in the session checkout', { options: { codex: true } }, async ($, on) => {
  const h = host(on)
  const out = await $.tool.call({ tool: RUN, task: 'Review it.', model: 'openai/gpt-6.1-sol', effort: 'high' })
  const started = JSON.parse(out.result)

  expect(started).toMatchObject({ harness: 'codex', model: 'openai/gpt-6.1-sol', effort: 'high', chosenBy: 'caller', mode: 'read-only' })
  expect(started.id).toMatch(/^20261118T083336-[0-9a-f]{6}$/)
  expect(started.runDir).toBe(`${ROOT}/${started.id}`)
  expect(h.spawned).toHaveLength(1)
  const argv: string[] = h.spawned[0].argv
  expect(argv.slice(argv.indexOf('-C'), argv.indexOf('-C') + 4)).toEqual(['-C', CALLER, '-s', 'read-only'])
  expect(codexCalls(h, 'login status')).toHaveLength(1)

  await $.tool.call({ tool: RUN, task: 'Again.', model: 'openai/gpt-6.1-sol', effort: 'high' })
  expect(codexCalls(h, 'debug models')).toHaveLength(1)
  expect(codexCalls(h, '--version')).toHaveLength(1)
  h.finish()
  await settle(h, () => h.submitted.length === 2)
})

test('a main-loop run is notified once when it ends', { options: { codex: true } }, async ($, on) => {
  const h = host(on)
  const { id } = JSON.parse((await $.tool.call({ tool: RUN, task: 'Review it.', model: 'openai/gpt-6.1-sol', effort: 'high' })).result)

  h.finish()
  await settle(h, () => h.submitted.length > 0)
  expect(h.submitted).toEqual([notice(id, 'done')])

  await $.turn.complete(TERMINAL_TURN)
  expect(h.submitted).toHaveLength(1)
})

test('a dropped notice is submitted at the next main-thread turn end, and only once', { options: { codex: true } }, async ($, on) => {
  const h = host(on, { submits: ['drop', 'accept'] })
  const { id } = JSON.parse((await $.tool.call({ tool: RUN, task: 'Review it.', model: 'openai/gpt-6.1-sol', effort: 'high' })).result)

  h.finish()
  await settle(h, () => h.submitted.length > 0)
  for (let i = 0; i < 20 && h.submitted.length < 2; i++) {
    await h.clock.advance(0)
    await $.turn.complete(TERMINAL_TURN)
  }
  expect(h.submitted).toEqual([notice(id, 'done'), notice(id, 'done')])

  await $.turn.complete(TERMINAL_TURN)
  expect(h.submitted).toHaveLength(2)
})

test('status and result of an unknown id name it', async ($, on) => {
  host(on)
  expect((await $.tool.call({ tool: STATUS, id: '20261118T000000-000000' })).result).toContain('unknown run id 20261118T000000-000000')
  expect((await $.tool.call({ tool: RESULT, id: '../../etc' })).result).toBe('unknown run id ../../etc')
})

test('status reports the state, times and the last messages and commands', async ($, on) => {
  const events = [
    ...[1, 2, 3, 4].map((n) => ({ type: 'item.completed', item: { type: 'agent_message', text: `message ${n}` } })),
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ type: 'item.completed', item: { type: 'command_execution', command: `cmd ${n}` } })),
  ]
  host(on, {
    files: {
      [`${ROOT}/${SEEDED}/state.json`]: seededState(),
      [`${ROOT}/${SEEDED}/events.jsonl`]: `${events.map((ev) => JSON.stringify(ev)).join('\n')}\n`,
    },
  })
  const status = JSON.parse((await $.tool.call({ tool: STATUS, id: SEEDED })).result)

  expect(status).toEqual({
    id: SEEDED,
    state: 'running',
    elapsedSec: 90,
    deadlineSec: 3600,
    model: 'openai/gpt-6.1-sol',
    effort: 'high',
    lastMessages: ['message 2', 'message 3', 'message 4'],
    lastCommands: ['cmd 2', 'cmd 3', 'cmd 4', 'cmd 5', 'cmd 6'],
  })
})

test('result without a wait reads a running run once and keeps it', async ($, on) => {
  const h = host(on, { files: { [`${ROOT}/${SEEDED}/state.json`]: seededState() } })
  const out = JSON.parse((await $.tool.call({ tool: RESULT, id: SEEDED })).result)

  expect(out).toEqual({ id: SEEDED, state: 'running', elapsedSec: 90 })
  expect(h.runs.some((r) => r.argv[0] === 'sh')).toBe(false)
  expect(h.files[`${ROOT}/${SEEDED}/state.json`]).toBeDefined()
})

test('a terminal result returns the envelope and removes the run directory', async ($, on) => {
  const h = host(on, { files: { [`${ROOT}/${SEEDED}/state.json`]: seededState({ state: 'done', exitCode: 0, envelope: ENVELOPE }) } })
  const out = JSON.parse((await $.tool.call({ tool: RESULT, id: SEEDED })).result)

  expect(out).toEqual({ id: SEEDED, state: 'done', envelope: ENVELOPE })
  expect(h.files[`${ROOT}/${SEEDED}/state.json`]).toBeUndefined()
  expect((await $.tool.call({ tool: STATUS, id: SEEDED })).result).toContain('unknown run id')
})

test('a wait that times out reads as running, with the watcher bounded by wait_seconds', async ($, on) => {
  const h = host(on, { files: { [`${ROOT}/${SEEDED}/state.json`]: seededState() }, watcher: 'timeout' })
  const out = JSON.parse((await $.tool.call({ tool: RESULT, id: SEEDED, wait_seconds: 30 })).result)

  expect(out).toEqual({ id: SEEDED, state: 'running', elapsedSec: 90 })
  const watcher = h.runs.find((r) => r.argv[0] === 'sh')
  expect(watcher?.init).toMatchObject({ cwd: `${ROOT}/${SEEDED}`, timeoutMs: 30_000 })
})

test('a wait that sees the run end returns its result', async ($, on) => {
  const h = host(on, { files: { [`${ROOT}/${SEEDED}/state.json`]: seededState() }, watcher: 'ends' })
  const out = JSON.parse((await $.tool.call({ tool: RESULT, id: SEEDED, wait_seconds: 900 })).result)

  expect(out).toEqual({ id: SEEDED, state: 'done', envelope: ENVELOPE })
  expect(h.runs.find((r) => r.argv[0] === 'sh')?.init).toMatchObject({ timeoutMs: 600_000 })
})

test('a run whose process ended after its session closed reads as failed', async ($, on) => {
  host(on, { files: { [`${ROOT}/${SEEDED}/state.json`]: seededState(), [`${ROOT}/${SEEDED}/exit`]: '0\n' } })
  const out = JSON.parse((await $.tool.call({ tool: RESULT, id: SEEDED })).result)

  expect(out.state).toBe('failed')
  expect(out.reason).toContain('exit 0')
})
