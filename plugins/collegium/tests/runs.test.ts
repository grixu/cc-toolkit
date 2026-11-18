import { expect, test } from 'claude-code/testing'
import { codex } from '../hooks/codex.ts'
import { flushNotices, newRunId, pendingNoticeIds, removeRun, startRun, sweepOnce, sweepRuns, whenSettled, type StartRequest } from '../hooks/runs.ts'
import { stubbedHost } from './host.ts'

const CALLER = '/work/repo'
const ROOT = '/work/repo.collegium'
const NOW = Date.UTC(2026, 10, 18, 8, 33, 36)

type Reply = { exitCode?: number; stdout?: string; stderr?: string }
type Run = { argv: string[]; cwd?: string }
type End = { code: number | null; signal: string | null }
type SubmitAnswer = 'accept' | 'drop' | 'reject'

const ENVELOPE = { status: 'done', summary: 'Reviewed it', result: 'fine', assumptions: [], open_questions: [] }

function fakeChild(stderr = 'starting\n') {
  let finish: (end: End) => void = () => {}
  const ended = new Promise<End>((resolve) => (finish = resolve))
  const gen = (async function* () {
    yield { stream: 'stderr', text: stderr }
    return await ended
  })()
  return { gen, finish: (end: End) => finish(end) }
}

function removeUnder(files: Record<string, string>, dir: string, keep?: string) {
  for (const key of Object.keys(files)) {
    if (!key.startsWith(`${dir}/`)) continue
    if (keep && key.startsWith(`${dir}/${keep}/`)) continue
    delete files[key]
  }
}

// A host with an in-memory file system, a git that answers by argument prefix (a list is consumed one call at a
// time, its last reply repeating), `kill` against a set of live pids, and a submit that answers from a queue.
function fixture(options: { files?: Record<string, string>; git?: Record<string, Reply | Reply[]>; alive?: number[]; submits?: SubmitAnswer[]; stderr?: string } = {}) {
  const { $, on, timers } = stubbedHost()
  const files: Record<string, string> = { ...options.files }
  const runs: Run[] = []
  const spawned: Record<string, any>[] = []
  const submitted: string[] = []
  const answers = [...(options.submits ?? [])]
  const git: Record<string, Reply | Reply[]> = { 'rev-parse --show-toplevel': { stdout: `${CALLER}\n` }, ...options.git }
  const child = fakeChild(options.stderr)

  on('session.root', () => ({ value: CALLER }))
  on('clock.now', () => ({ value: NOW }))
  on('fs.read', (_, e) => {
    if (!(e.path in files)) return { deny: `ENOENT: ${e.path}` }
    const text = files[e.path]
    const offset = e.options?.offset ?? 0
    return { value: e.options ? text.slice(offset, offset + (e.options.length ?? text.length)) : text }
  })
  on('fs.write', (_, e) => {
    files[e.path] = e.text
    return { value: undefined }
  })
  on('fs.stat', (_, e) => (e.path in files ? { value: { kind: 'file', size: files[e.path].length } } : { deny: `ENOENT: ${e.path}` }))
  on('fs.exists', (_, e) => ({ value: Object.keys(files).some((k) => k === e.path || k.startsWith(`${e.path}/`)) }))
  on('fs.list', (_, e) => {
    const names = new Map<string, string>()
    for (const key of Object.keys(files)) {
      if (!key.startsWith(`${e.path}/`)) continue
      const rest = key.slice(e.path.length + 1)
      names.set(rest.split('/')[0], rest.includes('/') ? 'directory' : 'file')
    }
    if (names.size === 0) return { deny: `ENOENT: ${e.path}` }
    return { value: [...names].map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })) }
  })
  on('process.spawn', (_, e) => {
    spawned.push(e)
    return { value: child.gen }
  })
  on('process.run', (_, e) => {
    const argv: string[] = e.argv
    runs.push({ argv, cwd: e.init?.cwd })
    const reply = (r: Reply = {}) => ({ value: { exitCode: r.exitCode ?? 0, stdout: r.stdout ?? '', stderr: r.stderr ?? '' } })
    if (argv[0] === 'kill' && argv[1] === '-0') return reply({ exitCode: (options.alive ?? []).includes(Number(argv[2])) ? 0 : 1 })
    if (argv[0] === 'kill') {
      child.finish({ code: null, signal: 'SIGTERM' })
      return reply()
    }
    if (argv[0] === 'rm') {
      removeUnder(files, argv[2])
      return reply()
    }
    if (argv[0] === 'find') {
      removeUnder(files, argv[1], 'worktree')
      return reply()
    }
    if (argv[0] === 'git') {
      const args = argv.slice(1).join(' ')
      const key = Object.keys(git).find((k) => args.startsWith(k))
      const entry = key ? git[key] : {}
      return reply(Array.isArray(entry) ? (entry.length > 1 ? entry.shift() : entry[0]) : entry)
    }
    return reply()
  })
  on('prompt.submit', (_, e) => {
    submitted.push(e.text)
    const answer = answers.shift() ?? 'accept'
    if (answer === 'reject') return { deny: 'no session is bound' }
    if (answer === 'drop') return { value: { drop: 'the session was stopped and nobody has sent input since' } }
    return { value: { text: e.text, origin: { kind: 'plugin', name: 'collegium' } } }
  })
  return { $, files, runs, spawned, submitted, timers, child }
}

let counter = 0
function request(extra: Partial<StartRequest> = {}): StartRequest {
  counter += 1
  return {
    id: `20261118T083336-${String(counter).padStart(6, '0')}`,
    adapter: codex,
    env: {},
    cwd: CALLER,
    model: 'openai/gpt-6.1-sol',
    effort: 'high',
    chosenBy: 'caller',
    task: 'Review it.',
    notify: true,
    ...extra,
  }
}

const notice = (id: string, state: string) => `Collegium run ${id} finished: ${state}. Call collegium_result.`

test('a run id is the UTC second and six hex digits', () => {
  expect(newRunId(NOW)).toMatch(/^20261118T083336-[0-9a-f]{6}$/)
})

test('starting a run writes the run files and state, spawns the shell wrapper in the run directory and returns at once', async () => {
  const f = fixture()
  const req = request()
  const runDir = `${ROOT}/${req.id}`

  const started = await startRun(f.$, req)

  expect(started).toEqual({ id: req.id, harness: 'codex', model: 'openai/gpt-6.1-sol', effort: 'high', chosenBy: 'caller', mode: 'read-only', runDir })
  expect(JSON.parse(f.files[`${runDir}/state.json`])).toEqual({
    id: req.id,
    harness: 'codex',
    model: 'openai/gpt-6.1-sol',
    effort: 'high',
    chosenBy: 'caller',
    mode: 'read-only',
    cwd: CALLER,
    startedAt: NOW,
    deadline: NOW + 60 * 60_000,
    pid: null,
    state: 'running',
    exitCode: null,
  })
  expect(f.files[`${runDir}/prompt.md`]).toContain('Review it.')
  expect(f.files[`${runDir}/schema.json`]).toBeDefined()
  expect(f.spawned).toHaveLength(1)
  const { argv, cwd } = f.spawned[0]
  expect(argv.slice(0, 7)).toEqual(['sh', '-c', 'echo $$ > pid; exec "$@" >> events.jsonl', 'sh', 'codex', 'exec', '--skip-git-repo-check'])
  expect(argv[argv.length - 1]).toBe(f.files[`${runDir}/prompt.md`])
  expect(cwd).toBe(runDir)
  expect(f.timers.map((t) => t.ms)).toContain(60 * 60_000)

  f.child.finish({ code: 0, signal: null })
  await whenSettled(req.id)
})

test('a run whose final message is a done envelope ends done, writes the exit code and is notified once', async () => {
  const f = fixture()
  const req = request()
  const runDir = `${ROOT}/${req.id}`
  await startRun(f.$, req)

  f.files[`${runDir}/last.json`] = JSON.stringify(ENVELOPE)
  f.files[`${runDir}/pid`] = '4242\n'
  f.child.finish({ code: 0, signal: null })
  const final = await whenSettled(req.id)

  expect(final).toMatchObject({ state: 'done', exitCode: 0, pid: 4242, envelope: ENVELOPE })
  expect(JSON.parse(f.files[`${runDir}/state.json`]).state).toBe('done')
  expect(f.files[`${runDir}/exit`]).toBe('0\n')
  expect(f.submitted).toEqual([notice(req.id, 'done')])
  expect(pendingNoticeIds()).not.toContain(req.id)
  expect(f.timers.find((t) => t.ms === 60 * 60_000)?.cancelled).toBe(true)

  await flushNotices(f.$)
  expect(f.submitted).toHaveLength(1)
})

test('a blocked envelope ends the run blocked', async () => {
  const f = fixture()
  const req = request()
  await startRun(f.$, req)

  f.files[`${ROOT}/${req.id}/last.json`] = JSON.stringify({ ...ENVELOPE, status: 'blocked' })
  f.child.finish({ code: 0, signal: null })

  expect((await whenSettled(req.id))?.state).toBe('blocked')
})

test('a turn.failed event without a final message fails the run with the error as its reason', async () => {
  const f = fixture()
  const req = request()
  await startRun(f.$, req)

  f.files[`${ROOT}/${req.id}/events.jsonl`] = [
    JSON.stringify({ type: 'error', message: 'deprecated config key' }),
    JSON.stringify({ type: 'turn.failed', error: { message: 'You exceeded your current quota' } }),
    '',
  ].join('\n')
  f.child.finish({ code: 1, signal: null })

  expect(await whenSettled(req.id)).toMatchObject({ state: 'failed', reason: 'You exceeded your current quota', exitCode: 1 })
})

test('a harness that exits non-zero before any event is a launch error naming its stderr', async () => {
  const f = fixture({ stderr: 'sh: codex: command not found\n' })
  const req = request()
  await startRun(f.$, req)

  f.child.finish({ code: 127, signal: null })
  const final = await whenSettled(req.id)

  expect(final?.state).toBe('failed')
  expect(final?.reason).toBe('launch error: codex exited 127: sh: codex: command not found')
})

test('a final message that is not an envelope fails the run as unparsable', async () => {
  const f = fixture()
  const req = request()
  await startRun(f.$, req)

  f.files[`${ROOT}/${req.id}/last.json`] = 'I am done, no JSON here.'
  f.files[`${ROOT}/${req.id}/events.jsonl`] = `${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'hi' } })}\n`
  f.child.finish({ code: 0, signal: null })

  expect(await whenSettled(req.id)).toMatchObject({ state: 'failed', reason: 'unparsable final message' })
})

test('the deadline kills the harness by its recorded pid and ends the run timeout', async () => {
  const f = fixture()
  const req = request({ timeoutMinutes: 5 })
  const runDir = `${ROOT}/${req.id}`
  await startRun(f.$, req)
  f.files[`${runDir}/pid`] = '4242\n'

  expect(JSON.parse(f.files[`${runDir}/state.json`]).deadline).toBe(NOW + 5 * 60_000)
  f.timers.find((t) => t.ms === 5 * 60_000)?.fn()
  const final = await whenSettled(req.id)

  expect(f.runs.some((r) => r.argv.join(' ') === 'kill -TERM 4242')).toBe(true)
  expect(final).toMatchObject({ state: 'timeout', exitCode: null, pid: 4242 })
  expect(f.files[`${runDir}/exit`]).toBe('SIGTERM\n')
  expect(f.submitted).toEqual([notice(req.id, 'timeout')])
})

test('a merge run whose merge conflicts ends conflict with its branch kept', async () => {
  const f = fixture({
    git: {
      'status --porcelain': { stdout: ' M src/a.ts\n' },
      'show --stat': { stdout: ' src/a.ts | 2 +-\n 1 file changed\n' },
      'rev-parse -q --verify MERGE_HEAD': [{ exitCode: 1 }, { exitCode: 0 }],
      'merge --ff': { exitCode: 1, stdout: 'CONFLICT (content): Merge conflict in src/a.ts\n' },
    },
  })
  const req = request({ write: 'merge' })
  const runDir = `${ROOT}/${req.id}`

  const started = await startRun(f.$, req)
  expect(started).toMatchObject({ mode: 'merge' })
  expect(JSON.parse(f.files[`${runDir}/state.json`]).branch).toBe(`collegium/${req.id}`)
  expect(f.spawned[0].argv).toContain('workspace-write')
  expect(f.spawned[0].argv).toContain(`${runDir}/worktree`)

  f.files[`${runDir}/last.json`] = JSON.stringify(ENVELOPE)
  f.child.finish({ code: 0, signal: null })
  const final = await whenSettled(req.id)

  expect(final).toMatchObject({ state: 'conflict', branch: `collegium/${req.id}`, envelope: ENVELOPE })
  expect(final?.reason).toContain('Merge conflict in src/a.ts')
  expect(f.runs.some((r) => r.argv.join(' ') === `git commit -m ${ENVELOPE.summary}`)).toBe(true)
  expect(f.submitted).toEqual([notice(req.id, 'conflict')])
})

test('a worktree that cannot be added is an error before launch and leaves no run directory', async () => {
  const f = fixture({ git: { 'worktree add': { exitCode: 128, stderr: 'fatal: not a git repository' } } })
  const req = request({ write: 'branch' })

  const started = await startRun(f.$, req)

  expect(started).toEqual({ error: 'cannot prepare the branch worktree: git worktree failed: fatal: not a git repository' })
  expect(f.spawned).toHaveLength(0)
  expect(Object.keys(f.files).some((k) => k.startsWith(`${ROOT}/${req.id}/`))).toBe(false)
})

test('a dropped submit waits for the main-thread turn.complete, which notifies it once', async () => {
  const f = fixture({ submits: ['drop', 'accept'] })
  const req = request()
  await startRun(f.$, req)

  f.files[`${ROOT}/${req.id}/last.json`] = JSON.stringify(ENVELOPE)
  f.child.finish({ code: 0, signal: null })
  await whenSettled(req.id)
  expect(f.submitted).toEqual([notice(req.id, 'done')])
  expect(pendingNoticeIds()).toContain(req.id)

  await flushNotices(f.$)
  expect(f.submitted).toEqual([notice(req.id, 'done'), notice(req.id, 'done')])
  expect(pendingNoticeIds()).not.toContain(req.id)

  await flushNotices(f.$)
  expect(f.submitted).toHaveLength(2)
})

test('a notice dropped again at turn.complete stays pending for the next one', async () => {
  const f = fixture({ submits: ['drop', 'drop', 'accept'] })
  const req = request()
  await startRun(f.$, req)

  f.child.finish({ code: 0, signal: null })
  await whenSettled(req.id)
  await flushNotices(f.$)
  expect(pendingNoticeIds()).toContain(req.id)

  await flushNotices(f.$)
  expect(pendingNoticeIds()).not.toContain(req.id)
  expect(f.submitted).toHaveLength(3)
})

test('a rejected submit is dropped and never retried', async () => {
  const f = fixture({ submits: ['reject'] })
  const req = request()
  await startRun(f.$, req)

  f.child.finish({ code: 0, signal: null })
  await whenSettled(req.id)
  expect(pendingNoticeIds()).not.toContain(req.id)

  await flushNotices(f.$)
  expect(f.submitted).toHaveLength(1)
})

test('a run started from a subagent is never notified', async () => {
  const f = fixture()
  const req = request({ notify: false })
  await startRun(f.$, req)

  f.child.finish({ code: 0, signal: null })
  await whenSettled(req.id)
  await flushNotices(f.$)

  expect(f.submitted).toEqual([])
  expect(pendingNoticeIds()).not.toContain(req.id)
})

const runState = (extra: Record<string, unknown>) => JSON.stringify({ cwd: CALLER, mode: 'read-only', state: 'done', pid: null, ...extra })

test('the sweep removes runs whose process is dead and keeps live runs and worktree changes', async () => {
  const f = fixture({
    alive: [22],
    git: { 'status --porcelain': { stdout: '?? new.ts\n' } },
    files: {
      [`${ROOT}/dead-done/state.json`]: runState({ pid: 11 }),
      [`${ROOT}/vanished/state.json`]: runState({ state: 'running' }),
      [`${ROOT}/live/state.json`]: runState({ state: 'running', pid: 22 }),
      [`${ROOT}/live-by-file/state.json`]: runState({ state: 'running' }),
      [`${ROOT}/live-by-file/pid`]: '22\n',
      [`${ROOT}/kept-worktree/state.json`]: runState({ mode: 'worktree', pid: 33 }),
      [`${ROOT}/kept-worktree/worktree/new.ts`]: 'x',
      [`${ROOT}/delivered/worktree/a.ts`]: 'x',
      [`${ROOT}/timed-out-branch/state.json`]: runState({ mode: 'branch', state: 'timeout', pid: 44 }),
      [`${ROOT}/timed-out-branch/worktree/a.ts`]: 'x',
    },
  })

  const removed = await sweepRuns(f.$)

  expect(removed.sort()).toEqual(['dead-done', 'timed-out-branch', 'vanished'])
  expect(Object.keys(f.files).sort()).toEqual([
    `${ROOT}/delivered/worktree/a.ts`,
    `${ROOT}/kept-worktree/state.json`,
    `${ROOT}/kept-worktree/worktree/new.ts`,
    `${ROOT}/live-by-file/pid`,
    `${ROOT}/live-by-file/state.json`,
    `${ROOT}/live/state.json`,
  ])
  expect(f.runs).toContainEqual({ argv: ['git', 'worktree', 'remove', '--force', `${ROOT}/timed-out-branch/worktree`], cwd: CALLER })
})

test('the sweep runs at the first call of a session only', async () => {
  const f = fixture({ files: { [`${ROOT}/old/state.json`]: runState({ pid: 11 }) } })

  expect(await sweepOnce(f.$)).toEqual(['old'])
  f.files[`${ROOT}/later/state.json`] = runState({ pid: 12 })
  expect(await sweepOnce(f.$)).toEqual([])
  expect(f.files[`${ROOT}/later/state.json`]).toBeDefined()
})

test('the sweep leaves a run this session is still running', async () => {
  const f = fixture()
  const req = request()
  await startRun(f.$, req)

  expect(await sweepRuns(f.$)).toEqual([])

  f.child.finish({ code: 0, signal: null })
  await whenSettled(req.id)
})

test('removing a delivered run keeps a worktree-mode run\'s worktree and deletes everything of any other run', async () => {
  const f = fixture({
    files: {
      [`${ROOT}/wt/state.json`]: runState({ mode: 'worktree' }),
      [`${ROOT}/wt/last.json`]: '{}',
      [`${ROOT}/wt/worktree/a.ts`]: 'x',
      [`${ROOT}/ro/state.json`]: runState({}),
      [`${ROOT}/ro/last.json`]: '{}',
    },
  })

  await removeRun(f.$, 'wt')
  await removeRun(f.$, 'ro')

  expect(Object.keys(f.files)).toEqual([`${ROOT}/wt/worktree/a.ts`])
})
