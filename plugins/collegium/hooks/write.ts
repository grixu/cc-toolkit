import { withoutTrailingSlash, type ProcessResult } from './harness.ts'

export const WRITE_MODES = ['worktree', 'branch', 'merge'] as const
export type WriteMode = (typeof WRITE_MODES)[number]

export type WriteRun = {
  mode: WriteMode
  id: string
  runDir: string
  /** The caller's checkout: worktrees are added from it and `merge` merges into it. */
  cwd: string
}

export type WriteResult = {
  state: 'done' | 'failed' | 'conflict'
  mode: WriteMode
  changed: boolean
  worktree?: string
  branch?: string
  committed?: boolean
  diffstat?: string
  merged?: boolean
  note?: string
  error?: string
}

// Signing can wait on a pinentry prompt, so commits get more than the host's 30 s default.
const GIT_TIMEOUT_MS = 120_000

export function worktreePath(runDir: string): string {
  return `${withoutTrailingSlash(runDir)}/worktree`
}

function branchName(id: string): string {
  return `collegium/${id}`
}

async function git($, cwd: string, args: string[]): Promise<ProcessResult> {
  return $.process.run(['git', ...args], { cwd, timeoutMs: GIT_TIMEOUT_MS }).catch((error: unknown) => ({
    exitCode: -1,
    stdout: '',
    stderr: error instanceof Error ? error.message : String(error),
  }))
}

function gitError(args: string[], r: ProcessResult): string {
  const detail = (r.stderr.trim() || r.stdout.trim()).slice(0, 500)
  return `git ${args[0]} failed${detail ? `: ${detail}` : ''}`
}

/** Adds the run's worktree before Codex starts; Codex then runs with `-C` set to the returned path. */
export async function prepareWrite($, run: WriteRun): Promise<{ worktree: string; branch?: string }> {
  const worktree = worktreePath(run.runDir)
  const branch = run.mode === 'worktree' ? undefined : branchName(run.id)
  const args = branch ? ['worktree', 'add', '-b', branch, worktree, 'HEAD'] : ['worktree', 'add', '--detach', worktree, 'HEAD']
  const r = await git($, run.cwd, args)
  if (r.exitCode !== 0) throw new Error(gitError(args, r))
  return branch ? { worktree, branch } : { worktree }
}

async function worktreeHasChanges($, worktree: string): Promise<boolean> {
  const args = ['status', '--porcelain', '--untracked-files=all']
  const r = await git($, worktree, args)
  if (r.exitCode !== 0) throw new Error(gitError(args, r))
  return r.stdout.trim() !== ''
}

/** Runs after Codex exits. `worktree` mode only reports whether files changed; the other modes commit any change, report the diffstat, remove the worktree and, in `merge` mode, merge. */
export async function finishWrite($, run: WriteRun, summary: string): Promise<WriteResult> {
  const worktree = worktreePath(run.runDir)
  const fail = (error: string, extra: Partial<WriteResult> = {}): WriteResult => ({ state: 'failed', mode: run.mode, changed: false, worktree, error, ...extra })

  let changed: boolean
  try {
    changed = await worktreeHasChanges($, worktree)
  } catch (error) {
    return fail((error as Error).message)
  }

  if (run.mode === 'worktree') {
    return { state: 'done', mode: run.mode, changed, worktree, ...(changed ? {} : { note: 'Codex changed no file.' }) }
  }

  const branch = branchName(run.id)
  let diffstat: string | undefined
  if (changed) {
    const add = await git($, worktree, ['add', '-A'])
    if (add.exitCode !== 0) return fail(gitError(['add'], add), { changed, branch })
    const message = summary.trim() || `Collegium run ${run.id}`
    const commit = await git($, worktree, ['commit', '-m', message])
    if (commit.exitCode !== 0) return fail(gitError(['commit'], commit), { changed, branch })
    const stat = await git($, worktree, ['show', '--stat', '--format=', 'HEAD'])
    diffstat = stat.exitCode === 0 ? stat.stdout.trim() : undefined
  }

  const removeArgs = ['worktree', 'remove', worktree]
  const remove = await git($, run.cwd, removeArgs)
  const committedPart: Partial<WriteResult> = changed ? { committed: true, diffstat } : { committed: false, note: 'Codex changed no file; nothing was committed.' }
  if (remove.exitCode !== 0) return fail(gitError(removeArgs, remove), { changed, branch, ...committedPart })

  const done: WriteResult = { state: 'done', mode: run.mode, changed, branch, ...committedPart }
  if (run.mode === 'branch' || !changed) return done

  // A merge the user left unfinished is theirs: merging or aborting here would destroy their resolution.
  if (await mergeInProgress($, run.cwd)) {
    return { ...done, state: 'conflict', merged: false, error: `a merge is already in progress in ${run.cwd}; ${branch} was left unmerged` }
  }

  const mergeArgs = ['merge', '--ff', '--no-edit', branch]
  const merge = await git($, run.cwd, mergeArgs)
  if (merge.exitCode === 0) return { ...done, merged: true }

  const error = gitError(mergeArgs, merge)
  if (await mergeInProgress($, run.cwd)) {
    await git($, run.cwd, ['merge', '--abort'])
    return { ...done, state: 'conflict', merged: false, error }
  }
  // A merge git refuses over local changes starts nothing, so there is nothing to abort.
  const refused = /would be overwritten by merge/.test(`${merge.stderr}\n${merge.stdout}`)
  return { ...done, state: refused ? 'conflict' : 'failed', merged: false, error }
}

async function mergeInProgress($, cwd: string): Promise<boolean> {
  const r = await git($, cwd, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'])
  return r.exitCode === 0
}
