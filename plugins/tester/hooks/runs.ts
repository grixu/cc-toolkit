export const DEFAULT_RETENTION = 50
export const RUN_ID = /^\d{8}T\d{6}Z-[a-z0-9-]{1,40}$/
// A run younger than this with no RESULTS.md may still be live in another worktree's session.
export const LIVE_WINDOW_MS = 24 * 60 * 60 * 1000

export type Options = { retention: number; explore: boolean; warnings: string[] }

export type Run = {
  id: string
  finished: boolean
  worktree?: string
  scope?: string
  startedAt?: string
}

export function readOptions(options: Record<string, unknown> | undefined): Options {
  const o = options ?? {}
  const warnings: string[] = []
  let retention = DEFAULT_RETENTION
  const raw = o.run_retention
  if (raw !== undefined && raw !== null && raw !== '') {
    const n = Number(raw)
    if (Number.isInteger(n) && n >= 1) retention = n
    else warnings.push(`run_retention "${raw}" is not a whole number of at least 1; keeping ${DEFAULT_RETENTION} runs`)
  }
  const explore = o.explore !== false && o.explore !== 'false'
  return { retention, explore, warnings }
}

export function slug(text: string): string {
  const s = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
  return s || 'run'
}

export function runId(now: Date, scope: string): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  return `${stamp}-${slug(scope)}`
}

export function startedMs(id: string): number {
  const m = id.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/)
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : 0
}

// FNV-1a: the mod runtime offers no crypto module, and the key only needs to tell paths apart.
function hash8(text: string): string {
  let h = 0x811c9dc5
  for (const byte of new TextEncoder().encode(text)) {
    h ^= byte
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

// Every worktree of one repository shares its git common dir, so keying the store on the
// main worktree pools their runs under one retention limit. The name alone is readable but not
// unique (`/a/b-c` and `/a-b/c` flatten alike), so the hash of the full path keeps stores apart.
export function repoKey(commonDir: string): string {
  const main = commonDir.replace(/\/+$/, '').replace(/\/\.git$/, '') || '/'
  const name = (main.split('/').pop() || 'root').replace(/[^A-Za-z0-9._-]+/g, '-')
  return `${name}-${hash8(main)}`
}

export function parseListing(stdout: string): Run[] {
  const runs: Run[] = []
  for (const line of stdout.split('\n')) {
    const [id, finished, json] = line.split('\t')
    if (!id || !RUN_ID.test(id)) continue
    let meta: Record<string, unknown> = {}
    try {
      meta = JSON.parse(json || '{}')
    } catch {
      // A torn run.json still names a run that counts toward retention.
    }
    runs.push({
      id,
      finished: finished === '1',
      worktree: typeof meta.worktree === 'string' ? meta.worktree : undefined,
      scope: typeof meta.scope === 'string' ? meta.scope : undefined,
      startedAt: typeof meta.startedAt === 'string' ? meta.startedAt : undefined,
    })
  }
  return runs.sort((a, b) => a.id.localeCompare(b.id))
}

export function pickRerun(runs: Run[], wanted: string, worktree: string): Run {
  if (wanted === 'last') {
    const mine = runs.filter((r) => r.finished && r.worktree === worktree)
    const last = mine[mine.length - 1]
    if (!last) throw new Error(`no finished run of this worktree (${worktree}) to rerun; run /tester:run without --rerun first`)
    return last
  }
  const run = runs.find((r) => r.id === wanted)
  if (!run) throw new Error(`no run with id ${wanted} in this repository's store`)
  if (!run.finished) throw new Error(`run ${wanted} has no RESULTS.md, so it never finished and has nothing to rerun`)
  return run
}

export function isLive(run: Run, now: number): boolean {
  return !run.finished && now - startedMs(run.id) < LIVE_WINDOW_MS
}

// Oldest first, never a kept id and never a run that may still be in progress.
export function prunable(runs: Run[], retention: number, keep: string[], now: number): string[] {
  let excess = runs.length - retention
  const out: string[] = []
  for (const run of runs) {
    if (excess <= 0) break
    if (keep.includes(run.id) || isLive(run, now)) continue
    out.push(run.id)
    excess--
  }
  return out
}
