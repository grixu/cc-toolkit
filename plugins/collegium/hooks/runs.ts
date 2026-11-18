import { withoutTrailingSlash, type HarnessAdapter, type RunEvent } from './harness.ts'
import { prepareRun } from './prompt.ts'
import { finishWrite, prepareWrite, type WriteMode, type WriteRun } from './write.ts'

export type RunStateName = 'running' | 'done' | 'blocked' | 'failed' | 'timeout' | 'conflict'

export type Envelope = {
  status: 'done' | 'blocked' | 'failed'
  summary: string
  result: unknown
  assumptions: string[]
  open_questions: string[]
}

export type RunState = {
  id: string
  harness: string
  model: string | null
  effort: string | null
  chosenBy: string
  mode: WriteMode | 'read-only'
  cwd: string
  startedAt: number
  deadline: number
  pid: number | null
  state: RunStateName
  exitCode: number | null
  branch?: string
  reason?: string
  envelope?: Envelope
  diffstat?: string
  worktree?: string
  note?: string
}

export type StartRequest = {
  id: string
  adapter: HarnessAdapter
  env: Record<string, string> // what the adapter's prepare returned for this run
  cwd: string // the caller's checkout
  model?: string
  effort?: string
  chosenBy: string
  write?: WriteMode
  task: string
  skill?: string
  resultSchema?: Record<string, unknown>
  timeoutMinutes?: number
  // Only a run started from the main loop is notified (D76): a subagent waits with collegium_result itself.
  notify: boolean
}

export type StartedRun = {
  id: string
  harness: string
  model: string | null
  effort: string | null
  chosenBy: string
  mode: WriteMode | 'read-only'
  runDir: string
}

export const DEFAULT_TIMEOUT_MINUTES = 60
const TERMINAL: readonly RunStateName[] = ['done', 'blocked', 'failed', 'timeout', 'conflict']
const EVENTS_TAIL_BYTES = 1_048_576
const STDERR_TAIL_CHARS = 2000

// `state.json` is the source of truth (D57); these only cache what this session started.
const cache = new Map<string, RunState>()
const settled = new Map<string, Promise<RunState>>()
const pendingNotices = new Map<string, string>()
let swept = false

export function isTerminal(state: RunStateName): boolean {
  return TERMINAL.includes(state)
}

export function newRunId(now: number): string {
  const stamp = new Date(now).toISOString().slice(0, 19).replace(/[-:]/g, '')
  const hex = Math.floor(Math.random() * 0x1000000).toString(16).padStart(6, '0')
  return `${stamp}-${hex}`
}

/** The git top level of the session root, or the session root outside git. */
export async function sessionTop($): Promise<string> {
  const root = withoutTrailingSlash(await $.session.root())
  const r = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd: root, timeoutMs: 10_000 }).catch(() => undefined)
  return r?.exitCode === 0 && r.stdout.trim() !== '' ? withoutTrailingSlash(r.stdout.trim()) : root
}

export async function runsRoot($): Promise<string> {
  const top = await sessionTop($)
  const cut = top.lastIndexOf('/')
  return `${top.slice(0, cut)}/${top.slice(cut + 1)}.collegium`
}

export async function runDirFor($, id: string): Promise<string> {
  return `${await runsRoot($)}/${id}`
}

export async function readRun($, id: string): Promise<RunState | null> {
  return readState($, await runDirFor($, id))
}

/** Resolves once a run this session started reaches a terminal state; undefined for any other run. */
export function whenSettled(id: string): Promise<RunState> | undefined {
  return settled.get(id)
}

async function readState($, runDir: string): Promise<RunState | null> {
  const text = await $.fs.read(`${runDir}/state.json`).catch(() => null)
  if (typeof text !== 'string') return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function readPid($, runDir: string): Promise<number | null> {
  const text = await $.fs.read(`${runDir}/pid`).catch(() => null)
  const pid = typeof text === 'string' ? Number.parseInt(text.trim(), 10) : NaN
  return Number.isInteger(pid) && pid > 0 ? pid : null
}

/** The parsed events of the tail of `events.jsonl`; a long run's file can pass what one read returns. */
export async function tailEvents($, adapter: HarnessAdapter, runDir: string): Promise<RunEvent[]> {
  const path = `${runDir}/events.jsonl`
  const stat = await $.fs.stat(path).catch(() => null)
  if (!stat || stat.size === 0) return []
  const offset = Math.max(0, stat.size - EVENTS_TAIL_BYTES)
  const text = await $.fs.read(path, { offset, length: stat.size - offset }).catch(() => '')
  return String(text)
    .split('\n')
    .map((line) => adapter.parseEvent(line))
    .filter((event): event is RunEvent => event !== null)
}

function parseEnvelope(text: string | null): Envelope | null {
  if (text === null) return null
  try {
    const value = JSON.parse(text)
    return ['done', 'blocked', 'failed'].includes(value?.status) ? value : null
  } catch {
    return null
  }
}

export async function startRun($, req: StartRequest): Promise<StartedRun | { error: string }> {
  const runDir = await runDirFor($, req.id)
  const prepared = await prepareRun({ read: (p) => $.fs.read(p), write: (p, t) => $.fs.write(p, t) }, runDir, {
    task: req.task,
    skill: req.skill,
    resultSchema: req.resultSchema,
  })
  if ('error' in prepared) return prepared

  const writeRun: WriteRun | null = req.write ? { mode: req.write, id: req.id, runDir, cwd: req.cwd } : null
  let dir = req.cwd
  let branch: string | undefined
  if (writeRun) {
    try {
      const added = await prepareWrite($, writeRun)
      dir = added.worktree
      branch = added.branch
    } catch (error) {
      await removeDir($, runDir)
      return { error: `cannot prepare the ${writeRun.mode} worktree: ${(error as Error).message}` }
    }
  }

  const prompt = await $.fs.read(prepared.promptPath)
  const startedAt = await $.clock.now()
  const timeoutMinutes = req.timeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES
  const state: RunState = {
    id: req.id,
    harness: req.adapter.id,
    model: req.model ?? null,
    effort: req.effort ?? null,
    chosenBy: req.chosenBy,
    mode: req.write ?? 'read-only',
    cwd: req.cwd,
    startedAt,
    deadline: startedAt + timeoutMinutes * 60_000,
    pid: null,
    state: 'running',
    exitCode: null,
    ...(branch ? { branch } : {}),
  }
  cache.set(req.id, state)

  let saving = Promise.resolve()
  const save = (patch: Partial<RunState>) => {
    saving = saving.catch(() => undefined).then(() => {
      Object.assign(state, patch)
      return $.fs.write(`${runDir}/state.json`, `${JSON.stringify(state, null, 2)}\n`)
    })
    return saving
  }
  await save({})

  const { argv, env, cwd } = req.adapter.invocation({ runDir, dir, write: writeRun !== null, prompt, model: req.model, effort: req.effort, env: req.env })
  // spawn exposes no pid, so the shell records its own, which `exec` hands to the harness; the mod has no append, so the shell writes the events.
  const child = $.process.spawn({ argv: ['sh', '-c', 'echo $$ > pid; exec "$@" >> events.jsonl', 'sh', ...argv], cwd, env })

  let timedOut = false
  const deadline = $.clock.after(timeoutMinutes * 60_000, () => {
    timedOut = true
    void (async () => {
      const pid = await readPid($, runDir)
      if (pid === null) await child.return(undefined)
      else await $.process.run(['kill', '-TERM', String(pid)]).catch(() => undefined)
    })()
  })
  $.clock.after(1000, () => {
    void readPid($, runDir).then((pid) => (pid !== null && state.pid === null ? save({ pid }) : undefined))
  })

  // Not awaited: the loop is the child's life and runs on after the handler returns (D66).
  const done = (async (): Promise<RunState> => {
    let stderr = ''
    let code: number | null = null
    let signal: string | null = null
    try {
      for (;;) {
        const piece = await child.next()
        if (piece.done) {
          code = piece.value?.code ?? null
          signal = piece.value?.signal ?? null
          break
        }
        if (piece.value.stream === 'stderr') stderr = (stderr + piece.value.text).slice(-STDERR_TAIL_CHARS)
      }
    } catch (error) {
      stderr = (error as Error).message
    }
    deadline.cancel()

    try {
      await $.fs.write(`${runDir}/exit`, `${code ?? signal ?? ''}\n`)
      const outcome = await settle($, req, runDir, { code, stderr, timedOut, timeoutMinutes })
      if (writeRun && !timedOut) Object.assign(outcome, await afterWrite($, writeRun, outcome))
      await save({ ...outcome, exitCode: code, pid: state.pid ?? (await readPid($, runDir)) })
    } catch (error) {
      await save({ state: 'failed', reason: `run bookkeeping failed: ${(error as Error).message}`, exitCode: code })
    }

    if (req.notify) await submitNotice($, req.id, `Collegium run ${req.id} finished: ${state.state}. Call collegium_result.`)
    return state
  })()
  settled.set(req.id, done)

  return { id: req.id, harness: state.harness, model: state.model, effort: state.effort, chosenBy: state.chosenBy, mode: state.mode, runDir }
}

async function settle(
  $,
  req: StartRequest,
  runDir: string,
  end: { code: number | null; stderr: string; timedOut: boolean; timeoutMinutes: number },
): Promise<Partial<RunState>> {
  if (end.timedOut) return { state: 'timeout', reason: `no result within ${end.timeoutMinutes} minutes; the process was killed` }
  const envelope = parseEnvelope(await req.adapter.finalMessage($, runDir))
  if (envelope) return { state: envelope.status, envelope }
  const events = await tailEvents($, req.adapter, runDir)
  const failed = events.filter((e) => e.kind === 'failed').pop()
  if (failed) return { state: 'failed', reason: failed.text }
  if (end.code !== 0 && events.length === 0) {
    const detail = end.stderr.trim()
    return { state: 'failed', reason: `launch error: ${req.adapter.id} exited ${end.code ?? 'by a signal'}${detail ? `: ${detail}` : ''}` }
  }
  return { state: 'failed', reason: 'unparsable final message' }
}

async function afterWrite($, run: WriteRun, outcome: Partial<RunState>): Promise<Partial<RunState>> {
  const w = await finishWrite($, run, outcome.envelope?.summary ?? '')
  const patch: Partial<RunState> = {}
  if (w.branch) patch.branch = w.branch
  if (w.diffstat) patch.diffstat = w.diffstat
  if (w.worktree && run.mode === 'worktree') patch.worktree = w.worktree
  if (w.note) patch.note = w.note
  if (w.state !== 'done') {
    patch.state = w.state
    patch.reason = w.error
  }
  return patch
}

// Each run is notified once (D67): accepted leaves the pending set, `drop` waits there for the next main-thread
// turn.complete, and a rejection (no session bound, as in a headless session) is dropped.
async function submitNotice($, id: string, text: string): Promise<void> {
  pendingNotices.delete(id)
  let answer
  try {
    answer = await $.prompt.submit({ text })
  } catch {
    return
  }
  if (answer?.drop !== undefined) pendingNotices.set(id, text)
}

/** For the main-thread `turn.complete` (D43): submits each notice the host dropped at completion. */
export async function flushNotices($): Promise<void> {
  for (const [id, text] of [...pendingNotices]) await submitNotice($, id, text)
}

export function pendingNoticeIds(): string[] {
  return [...pendingNotices.keys()]
}

async function removeDir($, runDir: string): Promise<void> {
  await $.process.run(['rm', '-rf', runDir]).catch(() => undefined)
}

// A worktree left inside the run directory (a run that timed out) is removed through git so the
// caller's repository keeps no stale entry; its branch stays.
async function deleteRunDir($, runDir: string, state: RunState | null): Promise<void> {
  if (state && (await $.fs.exists(`${runDir}/worktree`))) {
    await $.process.run(['git', 'worktree', 'remove', '--force', `${runDir}/worktree`], { cwd: state.cwd, timeoutMs: 120_000 }).catch(() => undefined)
  }
  await removeDir($, runDir)
}

/** After a delivered terminal result (D20): a `worktree`-mode run keeps its worktree, every other file goes. */
export async function removeRun($, id: string): Promise<void> {
  const runDir = await runDirFor($, id)
  const state = cache.get(id) ?? (await readState($, runDir))
  cache.delete(id)
  settled.delete(id)
  if (state?.mode === 'worktree' && (await $.fs.exists(`${runDir}/worktree`))) {
    await $.process.run(['find', runDir, '-mindepth', '1', '-maxdepth', '1', '!', '-name', 'worktree', '-exec', 'rm', '-rf', '{}', '+']).catch(() => undefined)
    return
  }
  await deleteRunDir($, runDir, state)
}

async function isAlive($, pid: number | null): Promise<boolean> {
  if (pid === null) return false
  const r = await $.process.run(['kill', '-0', String(pid)]).catch(() => undefined)
  return r?.exitCode === 0
}

async function worktreeHasChanges($, worktree: string): Promise<boolean> {
  const r = await $.process.run(['git', 'status', '--porcelain', '--untracked-files=all'], { cwd: worktree }).catch(() => undefined)
  return r?.exitCode !== 0 || r.stdout.trim() !== ''
}

/** Removes the run directories whose process is dead (D20); returns the ids removed. */
export async function sweepRuns($): Promise<string[]> {
  const root = await runsRoot($)
  const entries = await $.fs.list(root).catch(() => [])
  const removed: string[] = []
  for (const entry of entries) {
    if (entry.kind !== 'directory' || cache.has(entry.name)) continue
    const runDir = `${root}/${entry.name}`
    const state = await readState($, runDir)
    if (!state) continue
    if (await isAlive($, state.pid ?? (await readPid($, runDir)))) continue
    const worktree = `${runDir}/worktree`
    if (state.mode === 'worktree' && (await $.fs.exists(worktree)) && (await worktreeHasChanges($, worktree))) continue
    await deleteRunDir($, runDir, state)
    removed.push(entry.name)
  }
  return removed
}

/** The sweep at a session's first Collegium call. */
export async function sweepOnce($): Promise<string[]> {
  if (swept) return []
  swept = true
  return sweepRuns($)
}
