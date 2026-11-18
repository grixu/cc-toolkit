import { finalMessage } from './adapters.ts'
import type { Choice } from './choose.ts'
import { withoutTrailingSlash, type HarnessAdapter, type RunEvent } from './harness.ts'
import { ENVELOPE_STATUSES, prepareRun } from './prompt.ts'
import { finishWrite, prepareWrite, worktreePath, type WriteMode, type WriteRun } from './write.ts'

const TERMINAL = ['done', 'blocked', 'failed', 'timeout', 'conflict'] as const

export type RunStateName = 'running' | (typeof TERMINAL)[number]

export type Envelope = {
  status: (typeof ENVELOPE_STATUSES)[number]
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
  choice: Choice
  write?: WriteMode
  task: string
  skill?: string
  resultSchema?: Record<string, unknown>
  timeoutMinutes?: number
  // Only a run started from the main loop is notified: a subagent waits with collegium_result itself.
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

type Child = AsyncGenerator<{ stream: string; text: string }, { code?: number | null; signal?: string | null } | undefined>

type ExitStatus = { code: number | null; signal: string | null; stderr: string }

// One started run's bookkeeping; `save` chains the writes of state.json so they land in order.
type Supervisor = {
  req: StartRequest
  runDir: string
  dir: string // where the harness works: the caller's checkout, or the run's worktree
  writeRun: WriteRun | null
  prompt: string
  schemaPath: string
  timeoutMinutes: number
  state: RunState
  save: (patch: Partial<RunState>) => Promise<void>
  timedOut: boolean
}

const DEFAULT_TIMEOUT_MINUTES = 60
const PID_READ_DELAY_MS = 1000
const EVENTS_TAIL_BYTES = 1_048_576
const STDERR_TAIL_CHARS = 2000

// `state.json` is the source of truth; these only cache what this session started.
const sessionRuns = new Map<string, RunState>()
const settled = new Map<string, Promise<RunState>>()
const pendingNotices = new Map<string, string>()
let swept = false

export function isTerminal(state: RunStateName): boolean {
  return (TERMINAL as readonly RunStateName[]).includes(state)
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

async function runsRoot($): Promise<string> {
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

async function readState($, runDir: string): Promise<RunState | null> {
  const text = await $.fs.read(`${runDir}/state.json`).catch(() => null)
  if (typeof text !== 'string') return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Resolves once a run this session started reaches a terminal state; undefined for any other run. */
export function whenSettled(id: string): Promise<RunState> | undefined {
  return settled.get(id)
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

export async function startRun($, req: StartRequest): Promise<StartedRun | { error: string }> {
  const run = await prepareFiles($, req)
  if ('error' in run) return run
  const child = spawnHarness($, run)
  const deadline = armDeadline($, run, child)
  // Not awaited: the exit wait is the child's life and runs on after the handler returns.
  settled.set(req.id, awaitExit(child, deadline).then((exit) => recordOutcome($, run, exit)))
  const { id, harness, model, effort, chosenBy, mode } = run.state
  return { id, harness, model, effort, chosenBy, mode, runDir: run.runDir }
}

async function prepareFiles($, req: StartRequest): Promise<Supervisor | { error: string }> {
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
  const timeoutMinutes = req.timeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES
  const state = initialRunState(req, await $.clock.now(), timeoutMinutes, branch)
  sessionRuns.set(req.id, state)
  const save = stateSaver($, runDir, state)
  await save({})
  return { req, runDir, dir, writeRun, prompt, schemaPath: prepared.schemaPath, timeoutMinutes, state, save, timedOut: false }
}

function initialRunState(req: StartRequest, startedAt: number, timeoutMinutes: number, branch: string | undefined): RunState {
  const { model, effort, chosenBy } = req.choice
  return {
    id: req.id,
    harness: req.adapter.id,
    model: model ?? null,
    effort: effort ?? null,
    chosenBy,
    mode: req.write ?? 'read-only',
    cwd: req.cwd,
    startedAt,
    deadline: startedAt + timeoutMinutes * 60_000,
    pid: null,
    state: 'running',
    exitCode: null,
    ...(branch ? { branch } : {}),
  }
}

function stateSaver($, runDir: string, state: RunState): (patch: Partial<RunState>) => Promise<void> {
  let saving = Promise.resolve()
  return (patch) => {
    saving = saving.catch(() => undefined).then(() => {
      Object.assign(state, patch)
      return $.fs.write(`${runDir}/state.json`, `${JSON.stringify(state, null, 2)}\n`)
    })
    return saving
  }
}

function spawnHarness($, run: Supervisor): Child {
  const { req, runDir, state } = run
  const { argv, env, cwd } = req.adapter.invocation({
    runDir,
    dir: run.dir,
    write: run.writeRun !== null,
    prompt: run.prompt,
    schemaPath: run.schemaPath,
    model: state.model ?? undefined,
    effort: state.effort ?? undefined,
    env: req.env,
  })
  // spawn exposes no pid, so the shell records its own, which `exec` hands to the harness; the mod has no append, so the shell writes the events.
  const child = $.process.spawn({ argv: ['sh', '-c', 'echo $$ > pid; exec "$@" >> events.jsonl', 'sh', ...argv], cwd, env })
  $.clock.after(PID_READ_DELAY_MS, () => {
    void readPid($, runDir).then((pid) => (pid !== null && state.pid === null ? run.save({ pid }) : undefined))
  })
  return child
}

async function readPid($, runDir: string): Promise<number | null> {
  const text = await $.fs.read(`${runDir}/pid`).catch(() => null)
  const pid = typeof text === 'string' ? Number.parseInt(text.trim(), 10) : NaN
  return Number.isInteger(pid) && pid > 0 ? pid : null
}

function armDeadline($, run: Supervisor, child: Child): { cancel: () => void } {
  return $.clock.after(run.timeoutMinutes * 60_000, () => {
    run.timedOut = true
    void (async () => {
      const pid = await readPid($, run.runDir)
      if (pid === null) await child.return(undefined)
      else await $.process.run(['kill', '-TERM', String(pid)]).catch(() => undefined)
    })()
  })
}

async function awaitExit(child: Child, deadline: { cancel: () => void }): Promise<ExitStatus> {
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
  return { code, signal, stderr }
}

async function recordOutcome($, run: Supervisor, exit: ExitStatus): Promise<RunState> {
  const { req, runDir, writeRun, state } = run
  try {
    await $.fs.write(`${runDir}/exit`, `${exit.code ?? exit.signal ?? ''}\n`)
    const outcome = await outcomeOf($, req, runDir, { code: exit.code, stderr: exit.stderr, timedOut: run.timedOut, timeoutMinutes: run.timeoutMinutes })
    if (writeRun) Object.assign(outcome, outcome.state === 'done' ? await afterWrite($, writeRun, outcome) : leftUnmerged(run, outcome.state))
    await run.save({ ...outcome, exitCode: exit.code, pid: state.pid ?? (await readPid($, runDir)) })
  } catch (error) {
    await run.save({ state: 'failed', reason: `run bookkeeping failed: ${(error as Error).message}`, exitCode: exit.code })
  }

  if (req.notify) await submitNotice($, req.id, `Collegium run ${req.id} finished: ${state.state}. Call collegium_result.`)
  return state
}

async function outcomeOf(
  $,
  req: StartRequest,
  runDir: string,
  end: { code: number | null; stderr: string; timedOut: boolean; timeoutMinutes: number },
): Promise<Partial<RunState>> {
  if (end.timedOut) return { state: 'timeout', reason: `no result within ${end.timeoutMinutes} minutes; the process was killed` }
  const envelope = parseEnvelope(await finalMessage($, req.adapter, runDir))
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

function parseEnvelope(text: string | null): Envelope | null {
  if (text === null) return null
  try {
    const value = JSON.parse(text)
    return (ENVELOPE_STATUSES as readonly unknown[]).includes(value?.status) ? value : null
  } catch {
    return null
  }
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

// Half-done work must not reach the caller's checkout, so a run that did not end done is neither committed nor merged.
function leftUnmerged(run: Supervisor, ended: RunStateName | undefined): Partial<RunState> {
  if (run.writeRun?.mode === 'worktree') {
    return { worktree: worktreePath(run.runDir), note: `The run ended ${ended}, so its worktree is kept as Codex left it.` }
  }
  return { note: `The run ended ${ended}, so nothing was committed or merged; ${run.state.branch} stays as it started.` }
}

// Each run is notified once: accepted leaves the pending set, `drop` waits there for the next main-thread
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

/** For the main-thread `turn.complete`: submits each notice the host dropped at completion. */
export async function flushNotices($): Promise<void> {
  for (const [id, text] of [...pendingNotices]) await submitNotice($, id, text)
}

export function pendingNoticeIds(): string[] {
  return [...pendingNotices.keys()]
}

/** After a delivered terminal result: a `worktree`-mode run keeps its worktree, every other file goes. */
export async function removeRun($, id: string): Promise<void> {
  const runDir = await runDirFor($, id)
  const state = sessionRuns.get(id) ?? (await readState($, runDir))
  sessionRuns.delete(id)
  settled.delete(id)
  pendingNotices.delete(id)
  if (state?.mode === 'worktree' && (await $.fs.exists(worktreePath(runDir)))) {
    await $.process.run(['find', runDir, '-mindepth', '1', '-maxdepth', '1', '!', '-name', 'worktree', '-exec', 'rm', '-rf', '{}', '+']).catch(() => undefined)
    return
  }
  await deleteRunDir($, runDir, state)
}

// A worktree still inside the run directory is removed through git so the caller's repository keeps no stale entry;
// its branch stays.
async function deleteRunDir($, runDir: string, state: RunState | null): Promise<void> {
  if (state && (await $.fs.exists(worktreePath(runDir)))) {
    await $.process.run(['git', 'worktree', 'remove', '--force', worktreePath(runDir)],{ cwd: state.cwd, timeoutMs: 120_000 }).catch(() => undefined)
  }
  await removeDir($, runDir)
}

async function removeDir($, runDir: string): Promise<void> {
  await $.process.run(['rm', '-rf', runDir]).catch(() => undefined)
}

/** The sweep at a session's first Collegium call. */
export async function sweepOnce($): Promise<string[]> {
  if (swept) return []
  swept = true
  return sweepRuns($)
}

/** Removes the run directories whose process is dead; returns the ids removed. */
export async function sweepRuns($): Promise<string[]> {
  const root = await runsRoot($)
  const entries = await $.fs.list(root).catch(() => [])
  const removed: string[] = []
  for (const entry of entries) {
    if (entry.kind !== 'directory' || sessionRuns.has(entry.name)) continue
    const runDir = `${root}/${entry.name}`
    const state = await readState($, runDir)
    if (!state) continue
    if (await isAlive($, state.pid ?? (await readPid($, runDir)))) continue
    const worktree = worktreePath(runDir)
    if (state.mode === 'worktree' && (await $.fs.exists(worktree)) && (await mayHoldUnsavedWork($, worktree))) continue
    await deleteRunDir($, runDir, state)
    removed.push(entry.name)
  }
  return removed
}

async function isAlive($, pid: number | null): Promise<boolean> {
  if (pid === null) return false
  const r = await $.process.run(['kill', '-0', String(pid)]).catch(() => undefined)
  return r?.exitCode === 0
}

async function mayHoldUnsavedWork($, worktree: string): Promise<boolean> {
  const r = await $.process.run(['git', 'status', '--porcelain', '--untracked-files=all'], { cwd: worktree }).catch(() => undefined)
  return r?.exitCode !== 0 || r.stdout.trim() !== ''
}
