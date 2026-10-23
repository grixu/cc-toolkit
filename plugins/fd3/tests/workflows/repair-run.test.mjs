import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runWorkflow, seq } from './harness.mjs'
import { REPO, TOOLCHAIN, repair, repairArgs, repairDefaults, finding, line, ciPass, ciFail, crMerged } from './fixtures.mjs'

const run = (args, rules = [], options) => runWorkflow('repair-run.js', args, [...rules, ...repairDefaults()], options)

test('repair, then scoped CI, a review of the repair delta and the final gate', async () => {
  const r = await run(repairArgs())
  assert.deepEqual(r.labels, [
    'repair:app:feat-x',
    'toolchain-touch:app:feat-x',
    'ci:app:feat-x',
    'cr-prep:app:feat-x:repair',
    'cr:app:feat-x:repair:simplicity',
    'cr:app:feat-x:repair:security',
    'cr:app:feat-x:repair:spec',
    'cr-merge:app:feat-x:repair',
    'ci:app:feat-x:final',
  ])
  assert.deepEqual(r.phases, ['Recon', 'Repair', 'Validate'])
  assert.equal(r.call('repair:app:feat-x').schema, 'REPAIR_RESULT')
  // The delta review starts at the commit the repair agent reported, so it reads the repair alone.
  assert.match(r.call('cr-prep:app:feat-x:repair').prompt, /--base rep000 /)
  assert.match(r.call('ci:app:feat-x:final').prompt, /- \/r\/app\/tasks\/feat-x\.md/)
  assert.deepEqual(r.result.branches, [
    {
      repo: REPO,
      branch: 'feat/x',
      ci: 'passed',
      fixRounds: 0,
      preExisting: 1,
      skipped: [],
      review: { context: '/r/app.worktrees/.review/feat-x-repair', report: '/tmp/cr-report.md', findings: [], boyScout: [] },
    },
  ])
  assert.deepEqual(r.result.hil, [])
})

test('no toolchain handed in: scout and baseline run first', async () => {
  const args = repairArgs()
  delete args.toolchain
  delete args.baseline
  const r = await run(args)
  assert.deepEqual(r.labels.slice(0, 3), ['scout:app', 'baseline:app', 'repair:app:feat-x'])
})

test('review findings go to a human, never to a fixer; boy-scout findings are listed apart', async () => {
  const serious = finding({ location: 'src/a.ts:L1' })
  const nit = finding({ severity: 'nit', location: 'src/b.ts:L1' })
  const move = finding({ severity: 'comment', family: 'comments', rule: 'R3 · MOVE', risk: 'structural', location: 'src/c.ts:L1' })
  const keep = finding({ severity: 'comment', family: 'comments', rule: 'R2 · `KEEP`', location: 'src/d.ts:L1' })
  const scout = finding({ boyScout: true, location: 'src/old.ts:L1' })
  const reserved = finding({ reserved: true, location: 'src/r.ts:L1' })
  const r = await run(repairArgs(), [['cr-merge:app:feat-x:repair', crMerged([serious, nit, move, keep, scout, reserved])]])
  assert.ok(!r.has('fix-'))
  const review = r.result.branches[0].review
  assert.deepEqual(review.findings, [line(serious), line(nit), line(move)])
  assert.deepEqual(review.boyScout, [line(scout)])
  const reasons = r.result.hil.map((h) => h.reason)
  assert.equal(reasons.length, 2)
  assert.ok(reasons[0].includes(line(serious)) && reasons[1].includes(line(move)))
  assert.match(reasons[0], /left for the end-of-run decision; the branch is not held on it$/)
  // Only a gated review keeps the task files from being marked done.
  assert.match(r.call('ci:app:feat-x:final').prompt, /set `status: done`/)
})

test('gated review holds the task files on open findings', async () => {
  const r = await run(repairArgs({ review: 'gated' }), [['cr-merge:app:feat-x:repair', crMerged([finding()])]])
  assert.match(r.result.hil[0].reason, /the task files keep their status until a repair settles it$/)
  assert.doesNotMatch(r.call('ci:app:feat-x:final').prompt, /set `status: done`/)
  assert.equal(r.result.branches[0].ci, 'passed')
})

test('review false: CI only', async () => {
  const r = await run(repairArgs({ review: false }))
  assert.ok(!r.has('cr-prep:'))
  assert.equal(r.result.branches[0].review, undefined)
})

test('the review spec path is always the given specPath, never a branch copy', async () => {
  const r = await run(repairArgs())
  const prep = r.call('cr-prep:app:feat-x:repair').prompt
  assert.match(prep, /-C \/r\/app\.worktrees\/feat-x --spec \/r\/app\/docs\/spec\.md`/)
  assert.doesNotMatch(prep, /cat-file|git show/)
  assert.match(r.call('repair:app:feat-x').prompt, /Never edit, copy or commit the specification at \/r\/app\/docs\/spec\.md[^\n]*\n[^\n]*`\/fd3:build-spec \/r\/app\/docs\/spec\.md`/)
})

test('without a specPath the review runs with no spec lens argument and agents name a placeholder', async () => {
  const args = repairArgs()
  delete args.specPath
  const r = await run(args)
  assert.doesNotMatch(r.call('cr-prep:app:feat-x:repair').prompt, /--spec/)
  assert.match(r.call('repair:app:feat-x').prompt, /`\/fd3:build-spec <spec>`/)
})

test('a successor with empty instructions is carried onto its repaired base and validated, not repaired or reviewed', async () => {
  const args = repairArgs({ repairs: [repair('feat/b', { base: 'feat/a', instructions: [] }), repair('feat/a')] })
  const r = await run(args)
  assert.deepEqual(r.labels, [
    'repair:app:feat-a',
    'refresh:app:feat-b:pre-repair',
    'toolchain-touch:app:feat-a',
    'ci:app:feat-a',
    'cr-prep:app:feat-a:repair',
    'cr:app:feat-a:repair:simplicity',
    'cr:app:feat-a:repair:security',
    'cr:app:feat-a:repair:spec',
    'cr-merge:app:feat-a:repair',
    'ci:app:feat-a:final',
    'refresh:app:feat-b',
    'toolchain-touch:app:feat-b',
    'ci:app:feat-b',
    'ci:app:feat-b:final',
  ])
  assert.doesNotMatch(r.call('refresh:app:feat-b:pre-repair').prompt, /merge-tree/)
  // A carried branch has no repair commit of its own, so no review base is asked for.
  assert.doesNotMatch(r.call('refresh:app:feat-b').prompt, /merge-tree/)
  assert.match(r.call('ci:app:feat-b').prompt, /git diff --name-only feat\/a\.\.\.HEAD/)
  assert.deepEqual(r.result.branches.map((b) => [b.branch, b.ci]), [['feat/a', 'passed'], ['feat/b', 'passed']])
  assert.deepEqual(r.result.hil, [])
})

test('a stacked branch with its own decision is repaired after its base and reviewed from a rebuilt review base', async () => {
  const args = repairArgs({ repairs: [repair('feat/a'), repair('feat/b', { base: 'feat/a' })] })
  const r = await run(args, [
    ['repair:app:feat-b', { outcome: 'repaired', summary: 'ok', fromSha: 'repB' }],
    ['refresh:app:feat-b:pre-repair', { refreshed: true }],
    ['refresh:app:feat-b', { refreshed: true, reviewBase: 'synth1' }],
  ])
  assert.ok(r.labels.indexOf('refresh:app:feat-b:pre-repair') < r.labels.indexOf('repair:app:feat-b'))
  assert.match(r.call('refresh:app:feat-b').prompt, /merge-tree --write-tree repB feat\/a/)
  assert.match(r.call('cr-prep:app:feat-b:repair').prompt, /--base synth1 /)
})

test('no review base rebuilt: the stacked review reads from the repair commit and says so', async () => {
  const args = repairArgs({ repairs: [repair('feat/a'), repair('feat/b', { base: 'feat/a' })] })
  const r = await run(args, [['repair:app:feat-b', { outcome: 'repaired', summary: 'ok', fromSha: 'repB' }]])
  assert.match(r.call('cr-prep:app:feat-b:repair').prompt, /--base repB /)
  assert.ok(r.result.caveats.some((c) => /the review base could not be rebuilt with feat\/a's CI fixes/.test(c)))
})

test('a failed base blocks its carried successor', async () => {
  const args = repairArgs({ repairs: [repair('feat/a'), repair('feat/b', { base: 'feat/a', instructions: [] })] })
  const r = await run(args, [['repair:app:feat-a', { outcome: 'blocked', summary: 'no', reason: 'the decision contradicts the schema', fromSha: 'x' }]])
  assert.ok(!r.has('refresh:'))
  assert.ok(!r.has('ci:'))
  assert.deepEqual(r.result.branches, [])
  assert.deepEqual(r.result.hil, [
    { slug: null, kind: 'repair', stage: undefined, reason: '/r/app feat/a: the decision contradicts the schema' },
    { slug: null, kind: 'repair', stage: undefined, reason: '/r/app feat/b: its base feat/a was not repaired, so there was nothing to carry onto it' },
  ])
})

test('a repair agent dead twice is a no-verdict item', async () => {
  const r = await run(repairArgs(), [['repair:app:feat-x', null]])
  assert.ok(r.has('repair:app:feat-x:retry'))
  assert.equal(r.result.hil[0].kind, 'no-verdict')
  assert.equal(r.result.hil[0].stage, 'repair')
})

test('a base refresh that needs a judgment call stops the stacked repair before it starts', async () => {
  const args = repairArgs({ repairs: [repair('feat/a'), repair('feat/b', { base: 'feat/a' })] })
  const r = await run(args, [['refresh:app:feat-b:pre-repair', { refreshed: false, conflict: 'both edit x' }]])
  assert.ok(!r.has('repair:app:feat-b'))
  const h = r.result.hil.find((x) => x.stage === 'base-refresh')
  assert.equal(h.kind, 'merge-conflict')
  assert.match(h.reason, /both edit x; the repair was not applied/)
})

test('CI failure after a repair gets fix rounds; a round committing nothing stops them', async () => {
  const r = await run(repairArgs({ review: false }), [
    ['fix-ci:', { summary: 'none', fromSha: 's', toSha: 's' }],
    ['ci:app:feat-x', ciFail(['boom'])],
  ])
  assert.equal(r.callsMatching('fix-ci:').length, 1)
  assert.equal(r.result.branches[0].ci, 'failed')
  assert.match(r.result.hil[0].reason, /fix round 1 committed nothing/)
})

test('CI failure then pass after a fix round', async () => {
  const r = await run(repairArgs({ review: false }), [['ci:app:feat-x:final', ciPass], ['ci:app:feat-x', seq(ciFail(['boom']), ciPass)]])
  assert.deepEqual(r.callsMatching(/^(ci|fix)/).map((c) => c.label), ['ci:app:feat-x', 'fix-ci:app:feat-x#1', 'ci:app:feat-x#2', 'ci:app:feat-x:final'])
  assert.match(r.call('fix-ci:app:feat-x#1').prompt, /Decisions a human made on this task graph[^\n]*\n- rename foo to bar on feat\/x/)
  assert.equal(r.result.branches[0].fixRounds, 1)
})

test('CI incomplete is re-dispatched once and then has no verdict', async () => {
  const r = await run(repairArgs(), [['ci:app:feat-x', (p) => ({ ...ciPass(p), passed: false, incomplete: ['pnpm test'] })]])
  assert.ok(r.has('ci:app:feat-x:unfinished'))
  assert.ok(!r.has('fix-ci:'))
  assert.equal(r.result.branches[0].ci, 'no-verdict')
})

test('a review that did not run leaves the task files unmarked', async () => {
  const r = await run(repairArgs(), [['cr-prep:', { status: 'error', invoked: true, files: 0, reason: 'bad base' }]])
  assert.doesNotMatch(r.call('ci:app:feat-x:final').prompt, /set `status: done`/)
  assert.match(r.result.hil.find((h) => h.stage === 'review').reason, /cr-prepare failed: bad base/)
})

test(
  'an empty repair delta passes silently',
  { todo: 'suspected gap: an empty repair delta (no file, skipped 0) is neither dead nor not-applicable here, unlike the first review in implement-run' },
  async () => {
    const r = await run(repairArgs(), [['cr-prep:', { status: 'empty', invoked: true, files: 0, skipped: 0 }]])
    assert.deepEqual(r.result.hil, [])
    assert.deepEqual(r.result.branches[0].review, { context: '/r/app.worktrees/.review/feat-x-repair', report: null })
    assert.match(r.call('ci:app:feat-x:final').prompt, /set `status: done`/)
  },
)

test('a decorated lens name is normalised in the repair review', async () => {
  const r = await run(repairArgs(), [['cr-prep:', { status: 'ready', invoked: true, files: 2, skipped: 0, active: ['`Simplicity` '] }]])
  assert.match(r.call('cr:app:feat-x:repair:simplicity').prompt, /`--lens simplicity --context /)
})

test('a repair with no starting commit has no review verdict', async () => {
  const r = await run(repairArgs(), [['repair:app:feat-x', { outcome: 'repaired', summary: 'ok' }]], { checkSchemas: false })
  assert.ok(!r.has('cr-prep:'))
  assert.match(r.result.hil.find((h) => h.stage === 'review').reason, /did not report its starting commit/)
})

test('a branch without task files is validated but never marked', async () => {
  const r = await run(repairArgs({ repairs: [repair('feat/x', { taskFiles: [] })] }))
  assert.doesNotMatch(r.call('ci:app:feat-x:final').prompt, /set `status: done`/)
  assert.deepEqual(r.result.hil, [])
})

test('handover from a report path replaces the scout', async () => {
  const args = repairArgs({ reportPath: '/r/report.md' })
  delete args.toolchain
  delete args.baseline
  const r = await run(args, [['handover', { toolchain: [{ repository: REPO, report: TOOLCHAIN }], baseline: [] }]])
  assert.ok(!r.has('scout:'))
  assert.ok(r.has('baseline:app'))
  assert.equal(r.result.toolchain[REPO], TOOLCHAIN)
})
