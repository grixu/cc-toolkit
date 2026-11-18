import { catalogue as harnessCatalogue, detect, loginStatus, prepare } from './adapters.ts'
import { choose } from './choose.ts'
import { codex } from './codex.ts'
import { isEnabled, loadConfig, paletteConfig, type Config } from './config.ts'
import type { HarnessAdapter, Palette } from './harness.ts'
import { checkStrictSchema } from './prompt.ts'
import {
  flushNotices,
  isTerminal,
  newRunId,
  readRun,
  removeRun,
  runDirFor,
  sessionTop,
  startRun,
  sweepOnce,
  tailEvents,
  whenSettled,
  type RunState,
} from './runs.ts'
import { WRITE_MODES } from './write.ts'

const SERVER = 'collegium'
const RUN = 'collegium_run'
const STATUS = 'collegium_status'
const RESULT = 'collegium_result'

const ADAPTERS: Record<string, HarnessAdapter> = { codex }
const NAMES: Record<string, string> = { codex: 'Codex' }
const MAX_WAIT_SECONDS = 600
const STATUS_MESSAGE_COUNT = 3
const STATUS_COMMAND_COUNT = 5
const RUN_ID = /^\d{8}T\d{6}-[0-9a-f]{6}$/
const CATALOGUE_PREFIX = 'catalogue:'

// Waits for the exit file, then gives the run's bookkeeping (envelope, write-mode commit) up to 30 s to turn
// state.json terminal; the time inside `$.process.run` does not count toward the hook's budget.
const WATCH_SCRIPT =
  'until [ -f exit ]; do sleep 1; done; i=0; while grep -q \'"state": "running"\' state.json && [ "$i" -lt 30 ]; do sleep 1; i=$((i+1)); done'

const RUN_DESCRIPTION =
  'Start a piece of work on another coding agent and model, such as OpenAI Codex, and return at once with a run id. The agent works unattended in the background: read-only on your checkout by default, or in its own git worktree with `write`. Poll with collegium_status, and fetch the result envelope (status, summary, result, assumptions, open_questions) with collegium_result. Without model or effort, a decision model picks them for the task.'
const STATUS_DESCRIPTION =
  "Show how a Collegium run is going: its state, elapsed time and deadline, model and effort, and the agent's last messages and commands."
const RESULT_DESCRIPTION = `Return the result of a Collegium run once it ended: its state and envelope, plus the branch, diffstat or worktree of a write-mode run. With wait_seconds (at most ${MAX_WAIT_SECONDS}) it waits that long for the run to end; a run still going returns state "running", so call again. A delivered result removes the run directory.`

const RUN_SCHEMA = {
  type: 'object',
  required: ['task'],
  properties: {
    task: { type: 'string', description: 'What to do, or the arguments when skill is given.' },
    skill: { type: 'string', description: 'Absolute path of a SKILL.md to read and follow.' },
    harness: { type: 'string', enum: Object.keys(ADAPTERS) },
    model: { type: 'string', description: 'provider/model, e.g. openai/gpt-6.1-sol' },
    effort: { type: 'string' },
    write: { type: 'string', enum: WRITE_MODES },
    cwd: { type: 'string', description: "Absolute directory Codex works in; default the session's git top level." },
    result_schema: { type: 'object' },
    timeout_minutes: { type: 'number', minimum: 1 },
  },
}
const STATUS_SCHEMA = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', description: 'The run id collegium_run returned.' } },
}
const RESULT_SCHEMA = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', description: 'The run id collegium_run returned.' },
    wait_seconds: { type: 'number', minimum: 0, maximum: MAX_WAIT_SECONDS, description: 'How long to wait for the run to end; default 0.' },
  },
}

type Detection = Awaited<ReturnType<HarnessAdapter['detect']>>

export function register(on, options) {
  // Detection is lazy and per session; only a found harness is kept, so installing one mid-session is seen.
  const detected = new Map<string, Detection>()

  on('session.start', async ($, e, next) => {
    for (const [name, description, inputSchema] of [
      [RUN, RUN_DESCRIPTION, RUN_SCHEMA],
      [STATUS, STATUS_DESCRIPTION, STATUS_SCHEMA],
      [RESULT, RESULT_DESCRIPTION, RESULT_SCHEMA],
    ] as const) {
      try {
        await $.tool.register({ name, description, inputSchema })
      } catch {
        // A tool that failed to register is simply absent; callers treat a missing tool as Collegium unavailable.
      }
    }
    return next(e)
  })

  on('tool.call', { tool: `mcp__${SERVER}__${RUN}` }, async ($, e) => ({ result: await runTool($, e, options, detected) })).catch(
    ($, e, next) => ({ result: `collegium_run failed before launch (${next.error.kind}): ${next.error.message}` }),
  )

  on('tool.call', { tool: `mcp__${SERVER}__${STATUS}` }, async ($, e) => ({ result: await statusTool($, e) })).catch(($, e, next) => ({
    result: `collegium_status failed (${next.error.kind}): ${next.error.message}`,
  }))

  on('tool.call', { tool: `mcp__${SERVER}__${RESULT}` }, async ($, e) => ({ result: await resultTool($, e) })).catch(($, e, next) => ({
    result: `collegium_result failed (${next.error.kind}): ${next.error.message}`,
  }))

  // A notice the host dropped at completion goes out at the next main-thread turn end.
  on('turn.complete', async ($, e, next) => {
    const out = await next(e)
    if (e.agentId === undefined) await flushNotices($).catch(() => undefined)
    return out
  })
}

async function sweep($): Promise<void> {
  await sweepOnce($).catch(() => undefined)
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function runTool($, e, options: Record<string, unknown> | undefined, detected: Map<string, Detection>): Promise<string> {
  await sweep($)
  const invalid = checkInput(e)
  if (invalid) return invalid

  let config: Config
  try {
    config = await loadConfig($)
  } catch (error) {
    return `config error: ${message(error)}`
  }

  const harness = e.harness ?? pickHarness(config, options)
  const adapter = ADAPTERS[harness]
  if (!adapter) return `unknown harness ${harness}; Collegium knows ${Object.keys(ADAPTERS).join(', ')}`
  const name = NAMES[harness] ?? harness

  const found = detected.get(harness) ?? (await detect($, adapter))
  if (!found.installed) return `${name} is not installed: it was not found on PATH. Install it, then call again.`
  detected.set(harness, found)
  if (!isEnabled(config, harness, options)) {
    return config.disabled.includes(harness)
      ? `${name} is turned off by harnesses.disabled in the collegium config (the user or the project file).`
      : `${name} detected, enable it in /plugin configure.`
  }

  const id = newRunId(await $.clock.now())
  let env: Record<string, string>
  try {
    env = await prepare($, adapter, id)
  } catch (error) {
    return message(error)
  }
  const login = await loginStatus($, adapter, env)
  if (!login.loggedIn) return `${name} is logged out. Run \`${login.fix}\`, then call again.`

  let palettes: Palette[]
  try {
    palettes = await catalogue($, adapter, found.version)
  } catch (error) {
    return message(error)
  }
  const provider = e.model ? String(e.model).split('/')[0] : palettes[0]?.provider
  const palette = palettes.find((p) => p.provider === provider)
  if (!palette) {
    return e.model ? `unknown model ${e.model}; ${name} offers models of ${palettes.map((p) => p.provider).join(', ')}` : `${name} lists no models`
  }

  let choice
  try {
    choice = await choose($, { palette, config: paletteConfig(config, harness, palette.provider), backend: config.backend, model: e.model, effort: e.effort, task: e.task })
  } catch (error) {
    return message(error)
  }

  const started = await startRun($, {
    id,
    adapter,
    env,
    cwd: e.cwd ?? (await sessionTop($)),
    choice,
    write: e.write,
    task: e.task,
    skill: e.skill,
    resultSchema: e.result_schema,
    timeoutMinutes: e.timeout_minutes,
    // The main thread answering a subagent's notice would take that subagent's result.
    notify: e.agentId === undefined,
  })
  return 'error' in started ? started.error : JSON.stringify(started)
}

function checkInput(e): string | null {
  if (typeof e.task !== 'string' || e.task.trim() === '') return 'collegium_run needs a task'
  if (e.write !== undefined && !WRITE_MODES.includes(e.write)) return `unknown write mode ${e.write}; use one of ${WRITE_MODES.join(', ')}`
  if (e.timeout_minutes !== undefined && !(typeof e.timeout_minutes === 'number' && e.timeout_minutes >= 1)) {
    return 'timeout_minutes must be a number of at least 1'
  }
  for (const field of ['cwd', 'skill'] as const) {
    if (e[field] !== undefined && (typeof e[field] !== 'string' || !e[field].startsWith('/'))) return `${field} must be an absolute path`
  }
  if (e.result_schema !== undefined) {
    const broken = checkStrictSchema(e.result_schema)
    if (broken) return `invalid result_schema (${broken})`
  }
  return null
}

// The first harness in the user's order that is enabled; with none enabled, the first one, so the caller
// hears why it cannot run.
function pickHarness(config: Config, options: Record<string, unknown> | undefined): string {
  const known = Object.keys(ADAPTERS)
  const order = [...config.order.filter((h) => known.includes(h)), ...known.filter((h) => !config.order.includes(h))]
  return order.find((h) => isEnabled(config, h, options)) ?? order[0]
}

// Keyed by the harness version, so an upgrade reads the new catalogue; older versions' entries are dropped.
async function catalogue($, adapter: HarnessAdapter, version: string | undefined): Promise<Palette[]> {
  const key = `${CATALOGUE_PREFIX}${adapter.id}:${version ?? 'unknown'}`
  const cached = await $.store.get(key).catch(() => undefined)
  if (Array.isArray(cached)) return cached as Palette[]
  const palettes = await harnessCatalogue($, adapter)
  try {
    const stale = (await $.store.keys()).filter((k: string) => k.startsWith(`${CATALOGUE_PREFIX}${adapter.id}:`) && k !== key)
    for (const k of stale) await $.store.delete(k)
    await $.store.set(key, palettes)
  } catch {
    // A store that cannot hold the catalogue only costs a re-read on the next run.
  }
  return palettes
}

async function findRun($, id: unknown): Promise<{ state: RunState; runDir: string } | string> {
  if (typeof id !== 'string' || !RUN_ID.test(id)) return `unknown run id ${String(id)}`
  const state = await readRun($, id)
  if (!state) return `unknown run id ${id}: no such run, or its result was already delivered`
  return { state, runDir: await runDirFor($, id) }
}

function seconds(ms: number): number {
  return Math.max(0, Math.round(ms / 1000))
}

async function statusTool($, e): Promise<string> {
  await sweep($)
  const found = await findRun($, e.id)
  if (typeof found === 'string') return found
  const { state, runDir } = found
  const adapter = ADAPTERS[state.harness]
  const events = adapter ? await tailEvents($, adapter, runDir) : []
  const now = await $.clock.now()
  return JSON.stringify({
    id: state.id,
    state: state.state,
    elapsedSec: seconds(now - state.startedAt),
    deadlineSec: seconds(state.deadline - state.startedAt),
    model: state.model,
    effort: state.effort,
    lastMessages: events.filter((ev) => ev.kind === 'message').slice(-STATUS_MESSAGE_COUNT).map((ev) => ev.text),
    lastCommands: events.filter((ev) => ev.kind === 'command').slice(-STATUS_COMMAND_COUNT).map((ev) => ev.text),
  })
}

async function resultTool($, e): Promise<string> {
  await sweep($)
  const found = await findRun($, e.id)
  if (typeof found === 'string') return found
  const { runDir } = found
  let state = found.state
  const wait = Math.min(MAX_WAIT_SECONDS, Math.max(0, Number(e.wait_seconds) || 0))

  if (!isTerminal(state.state) && wait > 0) {
    // Rejecting at its timeout means the run is still going, never an error.
    await $.process.run(['sh', '-c', WATCH_SCRIPT], { cwd: runDir, timeoutMs: wait * 1000 }).catch(() => undefined)
    state = (await readRun($, state.id)) ?? state
  }
  state = await endedState($, state, runDir)

  if (!isTerminal(state.state)) {
    return JSON.stringify({ id: state.id, state: 'running', elapsedSec: seconds((await $.clock.now()) - state.startedAt) })
  }
  await removeRun($, state.id)
  return JSON.stringify({
    id: state.id,
    state: state.state,
    envelope: state.envelope,
    branch: state.branch,
    diffstat: state.diffstat,
    worktree: state.worktree,
    reason: state.reason,
    note: state.note,
  })
}

// A run whose process wrote `exit` while no session of ours watches it (the session that started it ended) will
// never have its state.json settled, so it reads as failed; one this session started is still recording.
async function endedState($, state: RunState, runDir: string): Promise<RunState> {
  if (isTerminal(state.state) || whenSettled(state.id)) return state
  const exit = await $.fs.read(`${runDir}/exit`).catch(() => null)
  if (typeof exit !== 'string') return state
  return { ...state, state: 'failed', reason: `the process ended (exit ${exit.trim() || 'unknown'}) after the session that started it closed` }
}
