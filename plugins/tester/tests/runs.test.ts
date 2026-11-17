import { expect, mock, test } from 'claude-code/testing'
import { DEFAULT_RETENTION, parseListing, pickRerun, prunable, readOptions, repoKey, runId, slug, type Run } from '../hooks/runs.ts'

const TOOL = 'mcp__tester__runs'
const NOW = Date.UTC(2026, 10, 17, 12, 0, 0)
const ok = (stdout = '') => ({ value: { exitCode: 0, stdout, stderr: '' } })

const run = (id: string, finished = true, worktree = '/repo'): Run => ({ id, finished, worktree })

test('options default to 50 kept runs and the explore suite on', () => {
  expect(readOptions(undefined)).toEqual({ retention: DEFAULT_RETENTION, explore: true, warnings: [] })
  expect(readOptions({ run_retention: 10, explore: false })).toEqual({ retention: 10, explore: false, warnings: [] })
  expect(readOptions({ run_retention: '7', explore: 'false' }).retention).toBe(7)
  expect(readOptions({ explore: 'false' }).explore).toBe(false)
})

test('an unusable retention keeps the default with a warning', () => {
  for (const bad of [0, -3, 2.5, 'many']) {
    const o = readOptions({ run_retention: bad })
    expect(o.retention).toBe(DEFAULT_RETENTION)
    expect(o.warnings.length).toBe(1)
  }
})

test('every worktree of one repository shares one store key', () => {
  const key = repoKey('/Users/me/code/app/.git')
  expect(key).toMatch(/^app-[0-9a-f]{8}$/)
  expect(repoKey('/Users/me/code/app/.git/')).toBe(key)
  expect(repoKey('/srv/bare.git')).toMatch(/^bare\.git-[0-9a-f]{8}$/)
})

test('paths that flatten alike still get different store keys', () => {
  expect(repoKey('/home/u/a-b/c/.git')).not.toBe(repoKey('/home/u/a/b-c/.git'))
  expect(repoKey('/home/u/my app/.git')).not.toBe(repoKey('/home/u/my-app/.git'))
})

test('a run id sorts by start time and names its scope', () => {
  expect(runId(new Date(NOW), 'spec.md')).toBe('20261117T120000Z-spec-md')
  expect(runId(new Date(NOW), '   ')).toBe('20261117T120000Z-run')
  expect(slug('The org-role assignment endpoints, all of them and then some more')).toBe('the-org-role-assignment-endpoints-all-of')
})

test('the listing parser keeps run ids only and tolerates a torn run.json', () => {
  const runs = parseListing(
    [
      '20261116T100000Z-b\t1\t{"worktree":"/repo","scope":"b"}',
      'not-a-run\t1\t{}',
      '20261115T100000Z-a\t0\t{"worktree":',
      '',
    ].join('\n'),
  )
  expect(runs.map((r) => r.id)).toEqual(['20261115T100000Z-a', '20261116T100000Z-b'])
  expect(runs[1]).toEqual({ id: '20261116T100000Z-b', finished: true, worktree: '/repo', scope: 'b', startedAt: undefined })
  expect(runs[0].finished).toBe(false)
})

test('rerun last takes the newest finished run of the current worktree only', () => {
  const runs = [run('20261115T100000Z-a'), run('20261116T100000Z-b', true, '/repo-wt'), run('20261116T110000Z-c', false)]
  expect(pickRerun(runs, 'last', '/repo').id).toBe('20261115T100000Z-a')
  expect(pickRerun(runs, 'last', '/repo-wt').id).toBe('20261116T100000Z-b')
  expect(() => pickRerun(runs, 'last', '/elsewhere')).toThrow()
  expect(pickRerun(runs, '20261116T100000Z-b', '/repo').id).toBe('20261116T100000Z-b')
  expect(() => pickRerun(runs, '20261116T110000Z-c', '/repo')).toThrow()
  expect(() => pickRerun(runs, '20200101T000000Z-x', '/repo')).toThrow()
})

test('pruning drops the oldest runs beyond retention, never a kept or live one', () => {
  const runs = [
    run('20261101T100000Z-a'),
    run('20261117T090000Z-live', false),
    run('20261102T100000Z-b'),
    run('20261103T100000Z-c'),
    run('20261117T120000Z-new', false),
  ].sort((x, y) => x.id.localeCompare(y.id))
  expect(prunable(runs, 2, ['20261117T120000Z-new', '20261101T100000Z-a'], NOW)).toEqual(['20261102T100000Z-b', '20261103T100000Z-c'])
  expect(prunable(runs, 5, ['20261117T120000Z-new'], NOW)).toEqual([])
  const abandoned = [run('20261001T100000Z-old', false), run('20261117T120000Z-new', false)]
  expect(prunable(abandoned, 1, ['20261117T120000Z-new'], NOW)).toEqual(['20261001T100000Z-old'])
})

function fakeHost(on, listing: string) {
  const calls: string[][] = []
  mock.env(on, { TESTER_RUNS_DIR: '/runs', HOME: '/home/me' })
  on('session.root', () => ({ value: '/repo' }))
  on('process.run', ($, e) => {
    const argv: string[] = e.argv
    calls.push(argv)
    if (argv[0] === 'git' && argv.includes('--show-toplevel')) return ok('/repo\n/repo/.git\n')
    if (argv[0] === 'git' && argv.includes('--abbrev-ref')) return ok('feat/x\n')
    if (argv[0] === 'git') return ok('abc123\n')
    if (argv[3] === 'tester-list') return ok(listing)
    return ok()
  })
  return calls
}

async function startSession($, on) {
  on('tool.register', () => ({ value: { tool: TOOL } }))
  on('session.start', () => ({ cwd: '/repo' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/repo' })
}

test('registers the runs tool at session start', async ($, on) => {
  const registered: string[] = []
  on('tool.register', ($, e) => {
    registered.push(e.name)
    return { value: { tool: TOOL } }
  })
  on('session.start', () => ({ cwd: '/repo' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/repo' })
  expect(registered).toEqual(['runs'])
})

test('a rerun opens a new run beside the previous one and strips old secrets', async ($, on) => {
  const listing = [
    '20261115T100000Z-spec-md\t1\t{"worktree":"/repo","scope":"spec.md"}',
    '20261116T100000Z-spec-md\t1\t{"worktree":"/repo-wt","scope":"spec.md"}',
  ].join('\n')
  const calls = fakeHost(on, listing)
  await startSession($, on)

  const answer = await $.tool.call({ tool: TOOL, scope: 'spec.md', rerun: 'last' })
  const out = JSON.parse(answer.result)
  const store = `/runs/${repoKey('/repo/.git')}`

  expect(out.work.startsWith(`${store}/`)).toBe(true)
  expect(out.previous.id).toBe('20261115T100000Z-spec-md')
  expect(out.previous.path).toBe(`${store}/20261115T100000Z-spec-md`)
  expect(out.explore).toBe(true)
  expect(out.retention).toBe(50)
  expect(out.pruned).toEqual([])

  const create = calls.find((c) => c[3] === 'tester-create')
  expect(create?.[5]).toBe(out.work)
  expect(JSON.parse(create?.[6] ?? '{}').rerunOf).toBe('20261115T100000Z-spec-md')
  const removed = calls.find((c) => c[3] === 'tester-remove')?.slice(4)
  expect(removed).toEqual([`${store}/20261115T100000Z-spec-md/secrets`, `${store}/20261116T100000Z-spec-md/secrets`])
})

test('a rerun with nothing to repeat answers with the reason', async ($, on) => {
  fakeHost(on, '')
  await startSession($, on)
  const answer = await $.tool.call({ tool: TOOL, scope: 'spec.md', rerun: 'last' })
  expect(answer.result).toContain('Run directory unavailable')
  expect(answer.result).toContain('no finished run of this worktree')
})
