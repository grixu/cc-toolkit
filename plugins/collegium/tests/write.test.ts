import { expect, test } from 'claude-code/testing'
import { finishWrite, prepareWrite, type WriteMode } from '../hooks/write.ts'

const CALLER = '/work/repo'
const RUN_DIR = '/work/repo.collegium/r1'
const WORKTREE = `${RUN_DIR}/worktree`

type Reply = { exitCode?: number; stdout?: string; stderr?: string }

function fakeGit(replies: Record<string, Reply> = {}, calls: { cwd: string; args: string[] }[] = []) {
  return ($, e) => {
    const args: string[] = e.argv.slice(1)
    calls.push({ cwd: e.init?.cwd, args })
    const key = Object.keys(replies).find((k) => args.join(' ').startsWith(k))
    const reply = key ? replies[key] : {}
    return { value: { exitCode: reply.exitCode ?? 0, stdout: reply.stdout ?? '', stderr: reply.stderr ?? '' } }
  }
}

const run = (mode: WriteMode) => ({ mode, id: 'r1', runDir: RUN_DIR, cwd: CALLER })
const CHANGED = { 'status --porcelain': { stdout: ' M src/a.ts\n?? src/b.ts\n' } }
const STAT = { 'show --stat': { stdout: ' src/a.ts | 2 +-\n src/b.ts | 1 +\n 2 files changed, 2 insertions(+), 1 deletion(-)\n' } }

test('worktree mode adds a detached worktree and leaves changes uncommitted', async ($, on) => {
  const calls: { cwd: string; args: string[] }[] = []
  on('process.run', fakeGit(CHANGED, calls))

  expect(await prepareWrite($, run('worktree'))).toEqual({ worktree: WORKTREE })
  const result = await finishWrite($, run('worktree'), 'did it')

  expect(calls.map((c) => [c.cwd, c.args.join(' ')])).toEqual([
    [CALLER, `worktree add --detach ${WORKTREE} HEAD`],
    [WORKTREE, 'status --porcelain --untracked-files=all'],
  ])
  expect(result).toEqual({ state: 'done', mode: 'worktree', changed: true, worktree: WORKTREE })
})

test('branch mode commits with the summary, reports the diffstat, removes the worktree and keeps the branch', async ($, on) => {
  const calls: { cwd: string; args: string[] }[] = []
  on('process.run', fakeGit({ ...CHANGED, ...STAT }, calls))

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

test('nothing is committed when Codex changed no file, and the result says so', async ($, on) => {
  const calls: { cwd: string; args: string[] }[] = []
  on('process.run', fakeGit({}, calls))

  const result = await finishWrite($, run('merge'), 'nothing')

  expect(calls.map((c) => c.args[0])).toEqual(['status', 'worktree'])
  expect(result).toMatchObject({ state: 'done', changed: false, committed: false, branch: 'collegium/r1' })
  expect(result.note).toContain('nothing was committed')
})

test('a failed commit ends the run failed with git\'s message and keeps the worktree', async ($, on) => {
  const calls: { cwd: string; args: string[] }[] = []
  on('process.run', fakeGit({ ...CHANGED, commit: { exitCode: 128, stderr: 'error: gpg failed to sign the data\n' } }, calls))

  const result = await finishWrite($, run('branch'), 'summary')

  expect(result).toMatchObject({ state: 'failed', worktree: WORKTREE, branch: 'collegium/r1' })
  expect(result.error).toContain('gpg failed to sign the data')
  expect(calls.some((c) => c.args[0] === 'worktree')).toBe(false)
})

test('merge mode merges the branch into the caller\'s checkout, fast-forwarding when possible', async ($, on) => {
  const calls: { cwd: string; args: string[] }[] = []
  on('process.run', fakeGit({ ...CHANGED, ...STAT }, calls))

  const result = await finishWrite($, run('merge'), 'summary')

  expect(calls.slice(-2).map((c) => [c.cwd, c.args.join(' ')])).toEqual([
    [CALLER, `worktree remove ${WORKTREE}`],
    [CALLER, 'merge --ff --no-edit collegium/r1'],
  ])
  expect(result).toMatchObject({ state: 'done', mode: 'merge', committed: true, merged: true, branch: 'collegium/r1' })
})

test('a merge conflict is aborted, keeps the branch and sets conflict', async ($, on) => {
  const calls: { cwd: string; args: string[] }[] = []
  on('process.run', fakeGit({ ...CHANGED, ...STAT, 'merge --ff': { exitCode: 1, stdout: 'CONFLICT (content): Merge conflict in src/a.ts\n' } }, calls))

  const result = await finishWrite($, run('merge'), 'summary')

  expect(calls.slice(-2).map((c) => [c.cwd, c.args.join(' ')])).toEqual([
    [CALLER, 'rev-parse -q --verify MERGE_HEAD'],
    [CALLER, 'merge --abort'],
  ])
  expect(calls.some((c) => c.args[0] === 'branch')).toBe(false)
  expect(result).toMatchObject({ state: 'conflict', merged: false, branch: 'collegium/r1', committed: true })
  expect(result.error).toContain('Merge conflict in src/a.ts')
})

test('a merge refused over local changes is a conflict with nothing to abort', async ($, on) => {
  const calls: { cwd: string; args: string[] }[] = []
  on('process.run', fakeGit({
    ...CHANGED,
    ...STAT,
    'merge --ff': { exitCode: 1, stderr: 'error: Your local changes to the following files would be overwritten by merge:\n\tsrc/a.ts\n' },
    'rev-parse -q --verify MERGE_HEAD': { exitCode: 1 },
  }, calls))

  const result = await finishWrite($, run('merge'), 'summary')

  expect(calls.some((c) => c.args.join(' ') === 'merge --abort')).toBe(false)
  expect(result).toMatchObject({ state: 'conflict', branch: 'collegium/r1' })
  expect(result.error).toContain('local changes')
})

test('a worktree git cannot add fails the preparation with git\'s message', async ($, on) => {
  on('process.run', fakeGit({ 'worktree add': { exitCode: 128, stderr: "fatal: a branch named 'collegium/r1' already exists\n" } }))

  const error = await prepareWrite($, run('branch')).then(() => undefined, (e: Error) => e)

  expect(error?.message).toContain('already exists')
})
