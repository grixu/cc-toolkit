import { expect, test } from 'claude-code/testing'
import { finishWrite, prepareWrite, type WriteMode } from '../hooks/write.ts'
import { stubbedHost } from './host.ts'

const CALLER = '/work/repo'
const RUN_DIR = '/work/repo.collegium/r1'
const WORKTREE = `${RUN_DIR}/worktree`

type Reply = { exitCode?: number; stdout?: string; stderr?: string }
type GitCall = { cwd: string; args: string[] }

const NO_MERGE_HEAD = { 'rev-parse -q --verify MERGE_HEAD': { exitCode: 1 } }

// A list of replies is consumed one call at a time, and its last reply repeats.
function useFakeGit(on, replies: Record<string, Reply | Reply[]> = {}): GitCall[] {
  const calls: GitCall[] = []
  const all = { ...NO_MERGE_HEAD, ...replies }
  on('process.run', ($, e) => {
    const args: string[] = e.argv.slice(1)
    calls.push({ cwd: e.init?.cwd, args })
    const key = Object.keys(all).find((k) => args.join(' ').startsWith(k))
    const entry = key ? all[key] : {}
    const reply = Array.isArray(entry) ? (entry.length > 1 ? entry.shift() : entry[0]) : entry
    return { value: { exitCode: reply.exitCode ?? 0, stdout: reply.stdout ?? '', stderr: reply.stderr ?? '' } }
  })
  return calls
}

const run = (mode: WriteMode) => ({ mode, id: 'r1', runDir: RUN_DIR, cwd: CALLER })
const CHANGED = { 'status --porcelain': { stdout: ' M src/a.ts\n?? src/b.ts\n' } }
const STAT = { 'show --stat': { stdout: ' src/a.ts | 2 +-\n src/b.ts | 1 +\n 2 files changed, 2 insertions(+), 1 deletion(-)\n' } }

test('worktree mode adds a detached worktree and leaves changes uncommitted', async () => {
  const { $, on } = stubbedHost()
  const calls = useFakeGit(on, CHANGED)

  expect(await prepareWrite($, run('worktree'))).toEqual({ worktree: WORKTREE })
  const result = await finishWrite($, run('worktree'), 'did it')

  expect(calls.map((c) => [c.cwd, c.args.join(' ')])).toEqual([
    [CALLER, `worktree add --detach ${WORKTREE} HEAD`],
    [WORKTREE, 'status --porcelain --untracked-files=all'],
  ])
  expect(result).toEqual({ state: 'done', mode: 'worktree', changed: true, worktree: WORKTREE })
})

test('branch mode commits with the summary, reports the diffstat, removes the worktree and keeps the branch', async () => {
  const { $, on } = stubbedHost()
  const calls = useFakeGit(on, { ...CHANGED, ...STAT })

  expect(await prepareWrite($, run('branch'))).toEqual({ worktree: WORKTREE, branch: 'collegium/r1' })
  const result = await finishWrite($, run('branch'), 'Add the b module')

  expect(calls.map((c) => [c.cwd, c.args.join(' ')])).toEqual([
    [CALLER, `worktree add -b collegium/r1 ${WORKTREE} HEAD`],
    [WORKTREE, 'status --porcelain --untracked-files=all'],
    [WORKTREE, 'add -A'],
    [WORKTREE, 'commit -m Add the b module'],
    [WORKTREE, 'show --stat --format= HEAD'],
    [CALLER, `worktree remove ${WORKTREE}`],
  ])
  expect(calls.some((c) => c.args.includes('--no-verify') || c.args.includes('--no-gpg-sign'))).toBe(false)
  expect(result).toMatchObject({ state: 'done', mode: 'branch', changed: true, committed: true, branch: 'collegium/r1' })
  expect(result.diffstat).toContain('2 files changed')
  expect(result.worktree).toBeUndefined()
})

test('nothing is committed when Codex changed no file, and the result says so', async () => {
  const { $, on } = stubbedHost()
  const calls = useFakeGit(on)

  const result = await finishWrite($, run('merge'), 'nothing')

  expect(calls.map((c) => c.args[0])).toEqual(['status', 'worktree'])
  expect(result).toMatchObject({ state: 'done', changed: false, committed: false, branch: 'collegium/r1' })
  expect(result.note).toContain('nothing was committed')
})

test('a failed commit ends the run failed with git\'s message and keeps the worktree', async () => {
  const { $, on } = stubbedHost()
  const calls = useFakeGit(on, { ...CHANGED, commit: { exitCode: 128, stderr: 'error: gpg failed to sign the data\n' } })

  const result = await finishWrite($, run('branch'), 'summary')

  expect(result).toMatchObject({ state: 'failed', worktree: WORKTREE, branch: 'collegium/r1' })
  expect(result.error).toContain('gpg failed to sign the data')
  expect(calls.some((c) => c.args[0] === 'worktree')).toBe(false)
})

test('merge mode merges the branch into the caller\'s checkout, fast-forwarding when possible', async () => {
  const { $, on } = stubbedHost()
  const calls = useFakeGit(on, { ...CHANGED, ...STAT })

  const result = await finishWrite($, run('merge'), 'summary')

  expect(calls.slice(-3).map((c) => [c.cwd, c.args.join(' ')])).toEqual([
    [CALLER, `worktree remove ${WORKTREE}`],
    [CALLER, 'rev-parse -q --verify MERGE_HEAD'],
    [CALLER, 'merge --ff --no-edit collegium/r1'],
  ])
  expect(result).toMatchObject({ state: 'done', mode: 'merge', committed: true, merged: true, branch: 'collegium/r1' })
})

test('a merge conflict is aborted, keeps the branch and sets conflict', async () => {
  const { $, on } = stubbedHost()
  const calls = useFakeGit(on, {
    ...CHANGED,
    ...STAT,
    'merge --ff': { exitCode: 1, stdout: 'CONFLICT (content): Merge conflict in src/a.ts\n' },
    'rev-parse -q --verify MERGE_HEAD': [{ exitCode: 1 }, { exitCode: 0 }],
  })

  const result = await finishWrite($, run('merge'), 'summary')

  expect(calls.slice(-4).map((c) => [c.cwd, c.args.join(' ')])).toEqual([
    [CALLER, 'rev-parse -q --verify MERGE_HEAD'],
    [CALLER, 'merge --ff --no-edit collegium/r1'],
    [CALLER, 'rev-parse -q --verify MERGE_HEAD'],
    [CALLER, 'merge --abort'],
  ])
  expect(calls.some((c) => c.args[0] === 'branch')).toBe(false)
  expect(result).toMatchObject({ state: 'conflict', merged: false, branch: 'collegium/r1', committed: true })
  expect(result.error).toContain('Merge conflict in src/a.ts')
})

test('a merge refused over local changes is a conflict with nothing to abort', async () => {
  const { $, on } = stubbedHost()
  const calls = useFakeGit(on, {
    ...CHANGED,
    ...STAT,
    'merge --ff': { exitCode: 1, stderr: 'error: Your local changes to the following files would be overwritten by merge:\n\tsrc/a.ts\n' },
  })

  const result = await finishWrite($, run('merge'), 'summary')

  expect(calls.some((c) => c.args.join(' ') === 'merge --abort')).toBe(false)
  expect(result).toMatchObject({ state: 'conflict', branch: 'collegium/r1' })
  expect(result.error).toContain('local changes')
})

test('a merge the user left in progress is neither merged into nor aborted', async () => {
  const { $, on } = stubbedHost()
  const calls = useFakeGit(on, { ...CHANGED, ...STAT, 'rev-parse -q --verify MERGE_HEAD': { exitCode: 0 } })

  const result = await finishWrite($, run('merge'), 'summary')

  expect(calls.some((c) => c.args[0] === 'merge')).toBe(false)
  expect(result).toMatchObject({ state: 'conflict', merged: false, committed: true, branch: 'collegium/r1' })
  expect(result.error).toContain('already in progress')
})

test('a merge that neither conflicts nor is refused fails the run without an abort', async () => {
  const { $, on } = stubbedHost()
  const calls = useFakeGit(on, { ...CHANGED, ...STAT, 'merge --ff': { exitCode: -1, stderr: 'timed out' } })

  const result = await finishWrite($, run('merge'), 'summary')

  expect(calls.some((c) => c.args.join(' ') === 'merge --abort')).toBe(false)
  expect(result).toMatchObject({ state: 'failed', merged: false, committed: true, branch: 'collegium/r1' })
  expect(result.error).toContain('timed out')
})

test('worktree mode with no change says Codex changed no file', async () => {
  const { $, on } = stubbedHost()
  useFakeGit(on)

  const result = await finishWrite($, run('worktree'), 'nothing')

  expect(result).toEqual({ state: 'done', mode: 'worktree', changed: false, worktree: WORKTREE, note: 'Codex changed no file.' })
})

test('a status git cannot read fails the run with git\'s message', async () => {
  const { $, on } = stubbedHost()
  useFakeGit(on, { status: { exitCode: 128, stderr: 'fatal: not a git repository\n' } })

  const result = await finishWrite($, run('branch'), 'summary')

  expect(result).toMatchObject({ state: 'failed', worktree: WORKTREE })
  expect(result.error).toContain('not a git repository')
})

test('a failed add ends the run failed before any commit', async () => {
  const { $, on } = stubbedHost()
  const calls = useFakeGit(on, { ...CHANGED, add: { exitCode: 128, stderr: 'fatal: index.lock exists\n' } })

  const result = await finishWrite($, run('branch'), 'summary')

  expect(calls.some((c) => c.args[0] === 'commit')).toBe(false)
  expect(result).toMatchObject({ state: 'failed', changed: true, branch: 'collegium/r1' })
  expect(result.error).toContain('index.lock exists')
})

test('a worktree git cannot remove fails the run but reports the commit', async () => {
  const { $, on } = stubbedHost()
  useFakeGit(on, { ...CHANGED, ...STAT, 'worktree remove': { exitCode: 128, stderr: 'fatal: worktree contains modified files\n' } })

  const result = await finishWrite($, run('merge'), 'summary')

  expect(result).toMatchObject({ state: 'failed', committed: true, worktree: WORKTREE, branch: 'collegium/r1' })
  expect(result.error).toContain('contains modified files')
})

test('a worktree git cannot add fails the preparation with git\'s message', async () => {
  const { $, on } = stubbedHost()
  useFakeGit(on, { 'worktree add': { exitCode: 128, stderr: "fatal: a branch named 'collegium/r1' already exists\n" } })

  const error = await prepareWrite($, run('branch')).then(() => undefined, (e: Error) => e)

  expect(error?.message).toContain('already exists')
})
