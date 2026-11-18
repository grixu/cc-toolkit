import { expect, test } from 'claude-code/testing'
import { codex } from '../hooks/codex.ts'
import { flushNotices, newRunId, pendingNoticeIds, removeRun, startRun, sweepOnce, sweepRuns, whenSettled, type StartRequest } from '../hooks/runs.ts'
import { CALLER, ENVELOPE, NOW, ROOT, fakeGitReply, gitReplyValue, notice, removeUnder, stubMemoryFs, stubbedHost, type End, type GitReply } from './host.ts'

type Run = { argv: string[]; cwd?: string }
type SubmitAnswer = 'accept' | 'drop' | 'reject'

function fakeChild(stderr = 'starting\n') {
  let finish: (end: End) => void = () => {}
  const ended = new Promise<End>((resolve) => (finish = resolve))
  const gen = (async function* () {
    yield { stream: 'stderr', text: stderr }
    return await ended
  })()
  return { gen, finish: (end: End) => finish(end) }
}

// A git reply list is consumed one call at a time, and its last reply repeats.
function fixture(options: { files?: Record<string, string>; git?: Record<string, GitReply | GitReply[]>; alive?: number[]; submits?: SubmitAnswer[]; stderr?: string } = {}) {
  const { $, on, timers } = stubbedHost()
  const files: Record<string, string> = { ...options.files }
  const runs: Run[] = []
  const spawned: Record<string, any>[] = []
  const submitted: string[] = []
  const answers = [...(options.submits ?? [])]
  const git: Record<string, GitReply | GitReply[]> = { 'rev-parse --show-toplevel': { stdout: `${CALLER}\n` }, ...options.git }
  const child = fakeChild(options.stderr)

  on('session.root', () => ({ value: CALLER }))
  on('clock.now', () => ({ value: NOW }))
  on('fs.read', (_, e) => {
    if (!(e.path in files)) return { deny: `ENOENT: ${e.path}` }
    const text = files[e.path]
    const offset = e.options?.offset ?? 0
    return { value: e.options ? text.slice(offset, offset + (e.options.length ?? text.length)) : text }
  })
  const removed = stubMemoryFs(on, files)
  on('process.spawn', (_, e) => {
    spawned.push(e)
    return { value: child.gen }
  })
  on('process.run', (_, e) => {
    const argv: string[] = e.argv
    runs.push({ argv, cwd: e.init?.cwd })
    if (argv[0] === 'kill' && argv[1] === '-0') return gitReplyValue({ exitCode: (options.alive ?? []).includes(Number(argv[2])) ? 0 : 1 })
    if (argv[0] === 'kill') {
      child.finish({ code: null, signal: 'SIGTERM' })
      return gitReplyValue()
    }
    if (removed(argv)) return gitReplyValue()
    if (argv[0] === 'find') {
      removeUnder(files, argv[1], 'worktree')
      return gitReplyValue()
    }
    if (argv[0] === 'git') return gitReplyValue(fakeGitReply(git, argv.slice(1)))
    return gitReplyValue()
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
    choice: { model: 'openai/gpt-6.1-sol', effort: 'high', chosenBy: 'caller', source: { model: 'caller', effort: 'caller' } },
    task: 'Review it.',
    notify: true,
    ...extra,
  }
}

test('a run id is the UTC second and six hex digits', () => {
  expect(newRunId(NOW)).toMatch(/^20261118T083336-[0-9a-f]{6}$/)
})

test('starting a run writes the run files and state, spawns the shell wrapper in the run directory and returns at once', async () => {
  const f = fixture()
  const req = request()
  const runDir = `${ROOT}/${req.id}`

  const started = await startRun(f.$, req)
  const { argv, cwd } = f.spawned[0]

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

test('a harness that exits 0 with no event and no final message fails the run as unparsable', async () => {
  const f = fixture()
  const req = request()
  await startRun(f.$, req)

  f.child.finish({ code: 0, signal: null })

  expect(await whenSettled(req.id)).toMatchObject({ state: 'failed', reason: 'unparsable final message', exitCode: 0 })
})

test('a harness that exits non-zero after events but no failed one fails the run as unparsable', async () => {
  const f = fixture()
  const req = request()
  await startRun(f.$, req)

  f.files[`${ROOT}/${req.id}/events.jsonl`] = `${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'hi' } })}\n`
  f.child.finish({ code: 1, signal: null })

  expect(await whenSettled(req.id)).toMatchObject({ state: 'failed', reason: 'unparsable final message', exitCode: 1 })
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

test('a branch run whose commit fails ends failed with git\'s message and its branch', async () => {
  const f = fixture({
    git: {
      'status --porcelain': { stdout: ' M src/a.ts\n' },
      commit: { exitCode: 128, stderr: 'error: gpg failed to sign the data\n' },
    },
  })
  const req = request({ write: 'branch' })
  await startRun(f.$, req)

  f.files[`${ROOT}/${req.id}/last.json`] = JSON.stringify(ENVELOPE)
  f.child.finish({ code: 0, signal: null })
  const final = await whenSettled(req.id)

  expect(final).toMatchObject({ state: 'failed', branch: `collegium/${req.id}`, envelope: ENVELOPE })
  expect(final?.reason).toContain('gpg failed to sign the data')
  expect(f.runs.some((r) => r.argv.join(' ').startsWith('git worktree remove'))).toBe(false)
})

test('a worktree run that ends done keeps its worktree in the state', async () => {
  const f = fixture({ git: { 'status --porcelain': { stdout: '?? new.ts\n' } } })
  const req = request({ write: 'worktree' })
  const runDir = `${ROOT}/${req.id}`
  await startRun(f.$, req)

  f.files[`${runDir}/last.json`] = JSON.stringify(ENVELOPE)
  f.child.finish({ code: 0, signal: null })
  const final = await whenSettled(req.id)

  expect(final).toMatchObject({ state: 'done', mode: 'worktree', worktree: `${runDir}/worktree` })
  expect(final?.branch).toBeUndefined()
  expect(final?.note).toBeUndefined()
})

test('a merge run that ends blocked is neither committed nor merged, and says so', async () => {
  const f = fixture({ git: { 'status --porcelain': { stdout: ' M src/a.ts\n' } } })
  const req = request({ write: 'merge' })
  await startRun(f.$, req)

  f.files[`${ROOT}/${req.id}/last.json`] = JSON.stringify({ ...ENVELOPE, status: 'blocked' })
  f.child.finish({ code: 0, signal: null })
  const final = await whenSettled(req.id)

  expect(final).toMatchObject({ state: 'blocked', branch: `collegium/${req.id}` })
  expect(final?.note).toBe(`The run ended blocked, so nothing was committed or merged; collegium/${req.id} stays as it started.`)
  expect(f.runs.some((r) => ['commit', 'merge'].includes(r.argv[1]))).toBe(false)
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

test('removing a run drops its pending notice', async () => {
  const f = fixture({ submits: ['drop'] })
  const req = request()
  await startRun(f.$, req)

  f.child.finish({ code: 0, signal: null })
  await whenSettled(req.id)
  await removeRun(f.$, req.id)
  await flushNotices(f.$)

  expect(pendingNoticeIds()).not.toContain(req.id)
  expect(f.submitted).toHaveLength(1)
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

test('the sweep removes a dead worktree-mode run whose worktree has no change', async () => {
  const f = fixture({
    files: {
      [`${ROOT}/clean-worktree/state.json`]: runState({ mode: 'worktree', pid: 55 }),
      [`${ROOT}/clean-worktree/worktree/a.ts`]: 'x',
    },
  })

  expect(await sweepRuns(f.$)).toEqual(['clean-worktree'])
  expect(Object.keys(f.files)).toEqual([])
  expect(f.runs).toContainEqual({ argv: ['git', 'worktree', 'remove', '--force', `${ROOT}/clean-worktree/worktree`], cwd: CALLER })
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
