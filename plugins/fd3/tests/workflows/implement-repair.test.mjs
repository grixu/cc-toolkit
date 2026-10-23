import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runWorkflow, seq } from './harness.mjs'
import { REPO, TOOLCHAIN, repair, repairArgs, repairDefaults, finding, line, ciPass, ciFail, crMerged, prepReady } from './fixtures.mjs'

const run = (args, rules = [], options) => runWorkflow('implement-run.js', args, [...rules, ...repairDefaults()], options)

test('repair, then the full gate, a review of the repair delta, and a marking agent', async () => {
  const r = await run(repairArgs())
  assert.deepEqual(r.labels, [
    'repair:app:feat-x',
    'toolchain-touch:app:feat-x',
    'ci:app:feat-x',
    'cr-prep:app:feat-x:repair',
    'cr:app:feat-x:repair:correctness',
    'cr:app:feat-x:repair:security',
    'cr-merge:app:feat-x:repair',
    'conformance:app:feat-x',
    'mark:app:feat-x',
  ])
  assert.deepEqual(r.phases, ['Recon', 'Repair', 'Validate'])
  assert.equal(r.call('repair:app:feat-x').schema, 'REPAIR_RESULT')
  // The delta review starts at the commit the repair agent reported, so it reads the repair alone.
  assert.match(r.call('cr-prep:app:feat-x:repair').prompt, /--base rep000 /)
  assert.match(r.call('ci:app:feat-x').prompt, /Run every command in full/)
  assert.doesNotMatch(r.call('ci:app:feat-x').prompt, /set `status: done`/)
  assert.match(r.call('mark:app:feat-x').prompt, /- \/r\/app\/tasks\/feat-x\.md/)
  assert.deepEqual(r.result.branches, [
    {
      repo: REPO,
      branch: 'feat/x',
      ci: 'passed',
      fixRounds: 0,
      preExisting: 1,
      skipped: [],
      review: { context: '/r/app.worktrees/.review/feat-x-repair', report: '/tmp/cr-report.md', findings: [], boyScout: [], applied: 0 },
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

test('only a safe finding in the repair own hunks is fixed; the rest go to a human, boy-scout findings apart', async () => {
  const safe = finding({ family: 'correctness', rule: 'off-by-one', location: 'src/a.ts:L1' })
  const structural = finding({ family: 'correctness', risk: 'structural', location: 'src/s.ts:L1' })
  const bound = finding({ family: 'correctness', specBound: true, location: 'src/sb.ts:L1' })
  const access = finding({ family: 'security', rule: 'authz', access: true, location: 'src/ac.ts:L1' })
  const nit = finding({ severity: 'nit', location: 'src/b.ts:L1' })
  const move = finding({ severity: 'comment', family: 'comments', rule: 'R3 · MOVE', risk: 'structural', location: 'src/c.ts:L1' })
  const keep = finding({ severity: 'comment', family: 'comments', rule: 'R2 · `KEEP`', location: 'src/d.ts:L1' })
  const scout = finding({ boyScout: true, location: 'src/old.ts:L1' })
  const reserved = finding({ reserved: true, location: 'src/r.ts:L1' })
  const r = await run(repairArgs(), [['cr-merge:app:feat-x:repair', crMerged([safe, structural, bound, access, nit, move, keep, scout, reserved])]])
  assert.equal(r.callsMatching('fix-review:').length, 1)
  const fixer = r.call('fix-review:app:feat-x').prompt
  assert.match(fixer, /Fix review problems on branch feat\/x/)
  assert.ok(fixer.includes(`- ${line(safe)}`))
  for (const f of [structural, bound, access, nit, move, scout]) assert.ok(!fixer.includes(line(f)))
  assert.match(fixer, /no review reads these fixes after you/)
  const review = r.result.branches[0].review
  assert.deepEqual(review.findings, [line(safe), line(structural), line(bound), line(access), line(nit), line(move)])
  assert.deepEqual(review.boyScout, [line(scout)])
  assert.equal(review.applied, 1)
  const reasons = r.result.hil.map((h) => h.reason)
  assert.equal(reasons.length, 4)
  for (const [i, f] of [structural, bound, access, move].entries()) assert.ok(reasons[i].includes(line(f)))
  assert.match(reasons[0], /left for the end-of-run decision; the branch is not held on it$/)
  // The fixer moved HEAD past the graded commit and nothing reviews its fix, so the full gate runs again and marks.
  assert.ok(!r.has('cr-prep:app:feat-x:delta'))
  assert.match(r.call('ci:app:feat-x:final').prompt, /set `status: done`/)
  assert.ok(!r.has('mark:'))
})

test('a fix the review fixer skips goes to a human, and a fixer that commits nothing needs no second gate', async () => {
  const safe = finding({ family: 'correctness', location: 'src/a.ts:L1' })
  const r = await run(repairArgs({ review: 'gated' }), [
    ['cr-merge:app:feat-x:repair', crMerged([safe])],
    ['fix-review:', { summary: 'no', fromSha: 'head000', toSha: 'head000', skipped: [line(safe)] }],
  ])
  assert.ok(r.result.hil.some((h) => h.reason.includes(line(safe))))
  assert.equal(r.result.branches[0].review.applied, 0)
  assert.ok(!r.has('ci:app:feat-x:final') && !r.has('mark:'))
})

test('a gated repair review holds a security fix for a human', async () => {
  const sec = finding({ family: 'security', rule: 'injection', location: 'src/q.ts:L1' })
  const r = await run(repairArgs({ review: 'gated' }), [['cr-merge:app:feat-x:repair', crMerged([sec])]])
  assert.ok(!r.has('fix-review:'))
  assert.ok(r.result.hil[0].reason.includes(line(sec)))
})

test('the repair review is narrowed to the correctness and security lenses', async () => {
  const r = await run(repairArgs(), [['cr-prep:', prepReady(['correctness', 'simplicity', 'spec'])]])
  assert.match(r.call('cr-prep:app:feat-x:repair').prompt, /narrow the review to the correctness and security lenses[^]*scope\.json/)
  assert.deepEqual(r.callsMatching('cr:').map((c) => c.label), ['cr:app:feat-x:repair:correctness'])
})

test('the repair review focuses on the repaired tasks only when there are task files and a spec', async () => {
  const withFiles = await run(repairArgs())
  assert.match(withFiles.call('cr-prep:app:feat-x:repair').prompt, /frontmatter lists of these task files:\n- \/r\/app\/tasks\/feat-x\.md\nAppend `--spec-focus/)
  const noFiles = await run(repairArgs({ repairs: [repair('feat/x', { taskFiles: [] })] }))
  assert.doesNotMatch(noFiles.call('cr-prep:app:feat-x:repair').prompt, /spec-focus/)
  const args = repairArgs()
  delete args.specPath
  const noSpec = await run(args)
  assert.doesNotMatch(noSpec.call('cr-prep:app:feat-x:repair').prompt, /spec-focus/)
})

test('a small repair gets one scan agent for both review lenses', async () => {
  const r = await run(repairArgs(), [['cr-prep:', prepReady(['correctness', 'security'], 1)]])
  assert.deepEqual(r.callsMatching('cr:').map((c) => c.label), ['cr:app:feat-x:repair:all'])
  assert.match(r.call('cr:app:feat-x:repair:all').prompt, /`--lens correctness,security --context /)
  assert.ok(r.has('mark:app:feat-x'))
})

test('with no narrowed lens active the conformance check alone is the review', async () => {
  const r = await run(repairArgs(), [['cr-prep:', prepReady(['simplicity'])]])
  assert.ok(!r.has('cr:') && !r.has('cr-merge:'))
  assert.ok(r.has('conformance:app:feat-x') && r.has('mark:app:feat-x'))
  assert.deepEqual(r.result.hil, [])
})

test('the conformance check reads the repair diff against the quoted decisions', async () => {
  const unasked = { severity: 'high', rule: 'unasked', location: 'src/z.ts:L4', risk: 'structural', fix: 'drop the new retry', decision: 'none' }
  const r = await run(repairArgs(), [['conformance:', { checked: true, findings: [unasked] }]])
  const prompt = r.call('conformance:app:feat-x').prompt
  assert.match(prompt, /git -C \/r\/app\.worktrees\/feat-x diff rep000\.\.HEAD/)
  assert.match(prompt, /- rename foo to bar on feat\/x/)
  assert.equal(r.call('conformance:app:feat-x').model, null)
  const l = 'src/z.ts:L4 — conformance · unasked (high): drop the new retry'
  assert.deepEqual(r.result.branches[0].review.findings, [l])
  assert.ok(r.result.hil[0].reason.includes(l))
})

test('a conformance check that returns nothing leaves the task files unmarked', async () => {
  const r = await run(repairArgs(), [['conformance:', null]])
  assert.ok(r.has('conformance:app:feat-x:retry'))
  assert.match(r.result.hil.find((h) => h.stage === 'review').reason, /decision-conformance check returned no result/)
  assert.ok(!r.has('mark:'))
})

test('gated review holds the task files on open findings', async () => {
  const r = await run(repairArgs({ review: 'gated' }), [['cr-merge:app:feat-x:repair', crMerged([finding({ risk: 'structural' })])]])
  assert.match(r.result.hil[0].reason, /the task files keep their status until a repair settles it$/)
  assert.ok(!r.has('mark:'))
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
    'cr:app:feat-a:repair:correctness',
    'cr:app:feat-a:repair:security',
    'cr-merge:app:feat-a:repair',
    'conformance:app:feat-a',
    'mark:app:feat-a',
    'refresh:app:feat-b',
    'toolchain-touch:app:feat-b',
    'ci:app:feat-b',
  ])
  assert.doesNotMatch(r.call('refresh:app:feat-b:pre-repair').prompt, /merge-tree/)
  // A carried branch has no repair commit of its own, so no review base is asked for.
  assert.doesNotMatch(r.call('refresh:app:feat-b').prompt, /merge-tree/)
  // Nothing reviews a carried branch, so its one full run marks its task files itself.
  assert.match(r.call('ci:app:feat-b').prompt, /set `status: done`/)
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
  // The fix round is verified scoped; the full list runs again on the commit the fix made.
  assert.match(r.call('ci:app:feat-x#2').prompt, /git diff --name-only origin\/main\.\.\.HEAD/)
  assert.match(r.call('ci:app:feat-x:final').prompt, /set `status: done`/)
  assert.match(r.call('fix-ci:app:feat-x#1').prompt, /Decisions a human made on this task graph[^\n]*\n- rename foo to bar on feat\/x/)
  assert.equal(r.result.branches[0].fixRounds, 1)
})

test('final gate failure gets one fix round, then passes and marks', async () => {
  const r = await run(repairArgs({ review: false }), [
    ['ci:app:feat-x:final#2', ciPass],
    ['ci:app:feat-x:final', ciFail(['stale index'])],
    ['ci:app:feat-x#2', ciPass],
    ['ci:app:feat-x', ciFail(['boom'])],
    ['fix-final:', { summary: 'fixed', fromSha: 'bbb222', toSha: 'ccc333' }],
  ])
  assert.deepEqual(r.callsMatching(/^(ci|fix)/).map((c) => c.label), ['ci:app:feat-x', 'fix-ci:app:feat-x#1', 'ci:app:feat-x#2', 'ci:app:feat-x:final', 'fix-final:app:feat-x', 'ci:app:feat-x:final#2'])
  assert.match(r.call('fix-final:app:feat-x').prompt, /Fix final-gate CI problems/)
  assert.match(r.call('ci:app:feat-x:final#2').prompt, /set `status: done`/)
  assert.equal(r.result.branches[0].fixRounds, 2)
  assert.equal(r.result.branches[0].ci, 'passed')
  assert.deepEqual(r.result.hil, [])
})

test('CI incomplete is re-dispatched once and then has no verdict', async () => {
  const r = await run(repairArgs(), [['ci:app:feat-x', (p) => ({ ...ciPass(p), passed: false, incomplete: ['pnpm test'] })]])
  assert.ok(r.has('ci:app:feat-x:unfinished'))
  assert.ok(!r.has('fix-ci:'))
  assert.equal(r.result.branches[0].ci, 'no-verdict')
})

test('a review that did not run leaves the task files unmarked', async () => {
  const r = await run(repairArgs(), [['cr-prep:', { status: 'error', invoked: true, files: 0, reason: 'bad base' }]])
  assert.ok(!r.has('mark:') && !r.has('ci:app:feat-x:final'))
  assert.match(r.result.hil.find((h) => h.stage === 'review').reason, /cr-prepare failed: bad base/)
})

test('a repair that committed nothing has no review verdict and leaves the task files unmarked', async () => {
  const r = await run(repairArgs(), [['cr-prep:', { status: 'empty', invoked: true, files: 0, skipped: 0 }]])
  assert.match(r.result.hil.find((h) => h.stage === 'review').reason, /reported the decision applied but committed nothing since /)
  assert.ok(!r.has('mark:'))
})

test('an empty repair delta against an alternate base stays a dead review', async () => {
  const r = await run(repairArgs(), [['cr-prep:', { status: 'empty', invoked: true, files: 0, skipped: 0, alternate: 'origin/dev' }]])
  assert.match(r.result.hil.find((h) => h.stage === 'review').reason, /did not run: .*the skill names origin\/dev/)
})

test('a decorated lens name is normalised in the repair review', async () => {
  const r = await run(repairArgs(), [['cr-prep:', { status: 'ready', invoked: true, files: 2, skipped: 0, active: ['`Correctness` '] }]])
  assert.match(r.call('cr:app:feat-x:repair:correctness').prompt, /`--lens correctness --context /)
})

test('a repair with no starting commit has no review verdict', async () => {
  const r = await run(repairArgs(), [['repair:app:feat-x', { outcome: 'repaired', summary: 'ok' }]], { checkSchemas: false })
  assert.ok(!r.has('cr-prep:'))
  assert.match(r.result.hil.find((h) => h.stage === 'review').reason, /did not report its starting commit/)
})

test('review off: the first full run is the gate and marks the task files itself', async () => {
  const r = await run(repairArgs({ review: false }))
  assert.deepEqual(r.callsMatching(/^(ci|mark)/).map((c) => c.label), ['ci:app:feat-x'])
  assert.match(r.call('ci:app:feat-x').prompt, /set `status: done`/)
  assert.deepEqual(r.result.hil, [])
})

test('a full verdict that names no commit runs the final gate', async () => {
  const r = await run(repairArgs(), [['ci:app:feat-x:final', ciPass], ['ci:app:feat-x', (p) => ({ ...ciPass(p), head: ' ' })]])
  assert.ok(r.has('ci:app:feat-x:final'))
  assert.ok(!r.has('mark:'))
})

test('a marking agent that does not confirm is a done-marking item', async () => {
  const r = await run(repairArgs(), [['mark:', { marked: false }]])
  assert.equal(r.result.hil[0].stage, 'done-marking')
  assert.equal(r.result.branches[0].ci, 'passed')
})

test('a branch without task files is validated but never marked', async () => {
  const r = await run(repairArgs({ repairs: [repair('feat/x', { taskFiles: [] })] }))
  assert.doesNotMatch(r.call('ci:app:feat-x').prompt, /set `status: done`/)
  assert.ok(!r.has('mark:') && !r.has('ci:app:feat-x:final'))
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
