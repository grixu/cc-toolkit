import { RUN_ID, isLive, parseListing, pickRerun, prunable, readOptions, repoKey, runId } from './runs.ts'

const TOOL = 'runs'
const DESCRIPTION =
  "Open the run directory for one /tester:run pass. Creates a fresh directory in the repository's run store outside the repo (shared by all its worktrees), prunes the oldest runs beyond the retention limit, removes leftover secrets from finished runs, and returns JSON: `work` (the run directory), `runId`, `previous` (the run to repeat when `rerun` is given), `explore` (whether the exploratory suite is enabled), `retention`, `pruned` and `warnings`. Call it once at the start of /tester:run."

const LIST = 'for d in "$1"/*/; do [ -f "$d/run.json" ] || continue; n=$(basename "$d"); f=0; [ -f "$d/RESULTS.md" ] && f=1; printf "%s\\t%s\\t" "$n" "$f"; tr -d "\\n" < "$d/run.json"; printf "\\n"; done; exit 0'
const CREATE = 'umask 077 && mkdir -p "$1" && mkdir "$2" && mkdir "$2/secrets" && printf "%s\\n" "$3" > "$2/run.json"'
const REMOVE = 'for d; do rm -rf -- "$d"; done'

type Input = { scope?: unknown; repo?: unknown; rerun?: unknown }

export function register(on, options) {
  const config = readOptions(options)

  on('session.start', async ($, e, next) => {
    try {
      await $.tool.register({
        name: TOOL,
        description: DESCRIPTION,
        inputSchema: {
          type: 'object',
          properties: {
            scope: { type: 'string', description: 'The run scope as the user gave it (spec path, free text, or "git diff"); names the directory' },
            repo: {
              type: 'string',
              description: "Optional. Absolute path of the worktree under test when it is not the session's working directory.",
            },
            rerun: { type: 'string', description: 'Optional. "last" for this worktree\'s newest finished run, or a run id.' },
          },
          required: ['scope'],
        },
      })
    } catch {
      // Without the tool the command falls back to a temporary directory and says --rerun is unavailable.
    }
    return next(e)
  })

  on('tool.call', { tool: `mcp__tester__${TOOL}` }, async ($, e) => ({
    result: JSON.stringify(await openRun($, { scope: e.scope, repo: e.repo, rerun: e.rerun }, config), null, 2),
  })).catch(($, e, next) => ({
    result: `Run directory unavailable (${next.error.kind}): ${next.error.message}. Fall back to a temporary work dir; --rerun is unavailable this run.`,
  }))
}

async function openRun($, input: Input, config: ReturnType<typeof readOptions>) {
  if (typeof input.scope !== 'string' || !input.scope.trim()) throw new Error('`scope` is required')
  const { worktree, common } = await locate($, input.repo)
  const root = await storeRoot($)
  const store = `${root}/${repoKey(common)}`

  const runs = parseListing((await sh($, LIST, 'tester-list', [store])).stdout)
  const previous = typeof input.rerun === 'string' && input.rerun.trim() ? pickRerun(runs, input.rerun.trim(), worktree) : null

  const now = new Date()
  const id = runId(now, input.scope)
  const work = `${store}/${id}`
  const meta = {
    worktree,
    branch: await gitOut($, worktree, ['rev-parse', '--abbrev-ref', 'HEAD']),
    head: await gitOut($, worktree, ['rev-parse', 'HEAD']),
    scope: input.scope,
    startedAt: now.toISOString(),
    rerunOf: previous?.id ?? null,
  }
  const created = await sh($, CREATE, 'tester-create', [store, work, JSON.stringify(meta)])
  if (created.exitCode !== 0) throw new Error(`could not create ${work}: ${created.stderr.trim().slice(0, 300)}`)

  const all = [...runs, { id, finished: false }]
  const pruned = prunable(all, config.retention, [id, ...(previous ? [previous.id] : [])], now.getTime())
  const stale = runs.filter((r) => !pruned.includes(r.id) && !isLive(r, now.getTime())).map((r) => `${store}/${r.id}/secrets`)
  const doomed = [...pruned.filter((p) => RUN_ID.test(p)).map((p) => `${store}/${p}`), ...stale]
  if (doomed.length) await sh($, REMOVE, 'tester-remove', doomed)

  return {
    work,
    runId: id,
    store,
    worktree,
    previous: previous ? { id: previous.id, path: `${store}/${previous.id}`, scope: previous.scope ?? null, startedAt: previous.startedAt ?? null } : null,
    explore: config.explore,
    retention: config.retention,
    pruned,
    warnings: config.warnings,
  }
}

// The session's working directory follows the model's `cd`, so the directory the session started
// in is the fallback; a caller-named `repo` never falls back, since keying another checkout is worse.
async function locate($, repo: unknown): Promise<{ worktree: string; common: string }> {
  if (repo !== undefined && repo !== null && repo !== '') {
    if (typeof repo !== 'string' || !repo.startsWith('/')) throw new Error('`repo` must be an absolute path')
    const found = await gitDirs($, repo)
    if (!found) throw new Error(`${repo} is not in a git repository`)
    return found
  }
  const here = await gitDirs($)
  if (here) return here
  const root = await $.session.root()
  const started = await gitDirs($, root)
  if (started) return started
  return { worktree: root, common: root }
}

async function gitDirs($, cwd?: string): Promise<{ worktree: string; common: string } | undefined> {
  const r = await run($, ['git', 'rev-parse', '--show-toplevel', '--path-format=absolute', '--git-common-dir'], cwd)
  if (r?.exitCode !== 0) return undefined
  const [worktree, common] = r.stdout.trim().split('\n')
  return worktree && common ? { worktree, common } : undefined
}

async function gitOut($, cwd: string, args: string[]): Promise<string | null> {
  const r = await run($, ['git', ...args], cwd)
  return r?.exitCode === 0 ? r.stdout.trim() : null
}

async function storeRoot($): Promise<string> {
  const override = await $.env.get('TESTER_RUNS_DIR')
  if (override) return absolute(override, 'TESTER_RUNS_DIR')
  const xdg = await $.env.get('XDG_CACHE_HOME')
  if (xdg) return `${absolute(xdg, 'XDG_CACHE_HOME')}/tester`
  const home = await $.env.get('HOME')
  if (!home) throw new Error('HOME is not set, so there is no cache directory for runs')
  return `${absolute(home, 'HOME')}/.cache/tester`
}

function absolute(path: string, name: string): string {
  if (!path.startsWith('/')) throw new Error(`${name} must be an absolute path`)
  return path.replace(/\/+$/, '')
}

// The host rejects an empty cwd, so a call with none runs in the session's own directory.
function run($, argv: string[], cwd?: string) {
  const init = cwd === undefined ? { timeoutMs: 30_000 } : { cwd, timeoutMs: 30_000 }
  return $.process.run(argv, init).catch(() => undefined)
}

async function sh($, script: string, name: string, args: string[]) {
  const r = await $.process.run(['sh', '-c', script, name, ...args], { timeoutMs: 60_000 })
  return r as { exitCode: number; stdout: string; stderr: string }
}
