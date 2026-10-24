import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runWorkflow, seq } from './harness.mjs'
import { REPO, SPEC, TOOLCHAIN, BASELINE, task, implementArgs, implementDefaults, finding, line, ciPass, ciFail, crMerged, prepReady, scannedAll } from './fixtures.mjs'

const run = (args, rules = []) => runWorkflow('implement-run.js', args, [...rules, ...implementDefaults()])
const status = (r) => Object.fromEntries(r.result.tasks.map((t) => [t.slug, t.status]))

test('happy path: two waves, merge, full CI, review with a fix, delta review, final gate, done', async () => {
  const f = finding()
  const r = await run(implementArgs(), [['cr-merge:app:feat-x:review', crMerged([f])]])

  assert.deepEqual(r.labels, [
    'scout:app',
    'baseline:app',
    'wave1:t1',
    'merge1:app',
    'wave2:t2',
    'merge2:app',
    'toolchain-touch:app:feat-x',
    'ci:app:feat-x',
    'cr-prep:app:feat-x:review',
    'cr:app:feat-x:review:simplicity',
    'cr:app:feat-x:review:security',
    'cr:app:feat-x:review:spec',
    'cr-merge:app:feat-x:review',
    'fix-cr:app:feat-x',
    'cr-prep:app:feat-x:delta',
    'cr:app:feat-x:delta:simplicity',
    'cr-merge:app:feat-x:delta',
    'ci:app:feat-x:final',
  ])
  assert.deepEqual(r.phases, ['Recon', 'Implement', 'Validate'])
  assert.deepEqual(status(r), { t1: 'done', t2: 'done' })
  assert.deepEqual(r.result.hil, [])
  assert.deepEqual(r.result.unreachable, [])
  assert.deepEqual(r.logs, ['Wave 1: t1', 'Wave 2: t2'])

  const b = r.result.branches[0]
  assert.equal(b.ci, 'passed')
  assert.equal(b.fixRounds, 0)
  assert.equal(b.preExisting, 1)
  assert.equal(b.reviewFindings, 1)
  assert.deepEqual(b.findings, [line(f)])
  assert.deepEqual(
    { applied: b.review.applied, forHuman: b.review.forHuman, reported: b.review.reported, reserved: b.review.reserved },
    { applied: 1, forHuman: 0, reported: 0, reserved: 0 },
  )
  assert.equal(b.review.delta.findings, 0)

  assert.equal(r.call('toolchain-touch:app:feat-x').schema, 'TOOLCHAIN_TOUCH_RESULT')
  assert.equal(r.call('ci:app:feat-x').model, 'haiku')
  assert.equal(r.call('scout:app').agentType, 'fd3:toolchain-scout')
  assert.match(r.call('fix-cr:app:feat-x').prompt, new RegExp(`- ${line(f).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  // The delta review is measured from the fixer's starting commit, so it reads only the fixes.
  assert.match(r.call('cr-prep:app:feat-x:delta').prompt, /--base aaa111 /)
  assert.match(r.call('cr-prep:app:feat-x:review').prompt, /--base origin\/main /)
  // The first run is the full gate; it runs again only because fix-cr moved HEAD.
  assert.match(r.call('ci:app:feat-x').prompt, /Run every command in full/)
  assert.match(r.call('ci:app:feat-x').prompt, /return the first as head either way/)
  assert.match(r.call('ci:app:feat-x:final').prompt, /Run every command in full/)
  assert.match(r.call('ci:app:feat-x:final').prompt, /- \/r\/app\/tasks\/t1\.md\n- \/r\/app\/tasks\/t2\.md/)
  assert.doesNotMatch(r.call('ci:app:feat-x').prompt, /set `status: done`/)
})

test('a review whose fixer committed nothing keeps the first full verdict, and one cheap agent marks', async () => {
  const r = await run(implementArgs(), [
    ['cr-merge:app:feat-x:review', crMerged([finding()])],
    ['fix-cr:', { summary: 'none', fromSha: 'head000', toSha: 'head000', skipped: [] }],
  ])
  assert.ok(!r.has('ci:app:feat-x:final'))
  const mark = r.call('mark:app:feat-x')
  assert.deepEqual([mark.schema, mark.model, mark.effort], ['MARK_RESULT', 'haiku', 'low'])
  assert.match(mark.prompt, /Set `status: done`[^\n]*\n- \/r\/app\/tasks\/t1\.md\n- \/r\/app\/tasks\/t2\.md/)
  assert.deepEqual(status(r), { t1: 'done', t2: 'done' })
})

test('a review with no findings needs no second full run', async () => {
  const r = await run(implementArgs())
  assert.deepEqual(r.callsMatching(/^ci:/).map((c) => c.label), ['ci:app:feat-x'])
  assert.ok(r.has('mark:app:feat-x'))
  assert.deepEqual(status(r), { t1: 'done', t2: 'done' })
})

test('a full verdict that names no commit, or a fixer that reports none, runs the final gate', async () => {
  const noHead = await run(implementArgs(), [['ci:app:feat-x:final', ciPass], ['ci:app:feat-x', (p) => ({ ...ciPass(p), head: '' })]])
  assert.ok(noHead.has('ci:app:feat-x:final'))
  assert.ok(!noHead.has('mark:'))

  const deadFixer = await run(implementArgs(), [['cr-merge:app:feat-x:review', crMerged([finding()])], ['fix-cr:', null]])
  assert.ok(deadFixer.has('ci:app:feat-x:final'))
})

test('a marking agent that does not confirm leaves the tasks merged', async () => {
  const r = await run(implementArgs(), [['mark:', { marked: false }]])
  assert.equal(r.result.hil[0].stage, 'done-marking')
  assert.deepEqual(status(r), { t1: 'merged', t2: 'merged' })
})

test('args may arrive JSON-encoded', async () => {
  const r = await run(JSON.stringify(implementArgs({ review: false })))
  assert.deepEqual(status(r), { t1: 'done', t2: 'done' })
})

test('toolchain and baseline handed in skip the scout and the baseline', async () => {
  const r = await run(implementArgs({ review: false, toolchain: { [REPO]: TOOLCHAIN }, baseline: { [REPO]: BASELINE } }))
  assert.ok(!r.has('scout:') && !r.has('baseline:'))
})

test('reportPath: one handover agent supplies recon, no scout', async () => {
  const r = await run(implementArgs({ review: false, reportPath: '/r/report.md' }), [
    ['handover', { toolchain: [{ repository: REPO, report: TOOLCHAIN }], baseline: [{ repository: REPO, commands: BASELINE.commands }] }],
  ])
  assert.equal(r.call('handover').schema, 'HANDOVER_RESULT')
  assert.equal(r.call('handover').model, 'haiku')
  assert.ok(!r.has('scout:') && !r.has('baseline:'))
})

test('an agent that returns nothing is retried once under a :retry label', async () => {
  const r = await run(implementArgs({ review: false }), [['wave1:t1:retry', { slug: 't1', outcome: 'implemented', summary: 'ok' }], ['wave1:t1', null]])
  assert.ok(r.labels.includes('wave1:t1:retry'))
  assert.deepEqual(status(r), { t1: 'done', t2: 'done' })
})

test('an implementation agent dead twice blocks the task as no-verdict', async () => {
  const r = await run(implementArgs({ review: false }), [['wave1:t1', null]])
  assert.deepEqual(status(r), { t1: 'blocked', t2: 'todo' })
  assert.equal(r.result.hil[0].kind, 'no-verdict')
  assert.deepEqual(r.result.unreachable, ['t2'])
})

test('review false runs no review agent; its one full run is the gate and marks done', async () => {
  const r = await run(implementArgs({ review: false }))
  assert.ok(!r.has('cr-prep:') && !r.has('cr:') && !r.has('cr-merge:'))
  assert.deepEqual(r.callsMatching(/^(ci|mark)/).map((c) => c.label), ['ci:app:feat-x'])
  assert.equal(r.call('ci:app:feat-x').result.marked, true)
  assert.deepEqual(status(r), { t1: 'done', t2: 'done' })
  assert.equal(r.result.branches[0].review, undefined)
})

test('spec-only review (0 judged, active=[spec]) runs the spec lens and completes', async () => {
  const r = await run(implementArgs(), [['cr-prep:app:feat-x:review', { status: 'ready', invoked: true, files: 0, skipped: 1, active: ['spec'] }]])
  assert.ok(r.has('cr:app:feat-x:review:spec'))
  assert.ok(r.has('cr-merge:app:feat-x:review'))
  assert.deepEqual(status(r), { t1: 'done', t2: 'done' })
})

test('a decorated lens name is normalised before it reaches the label and the cr-scan argument', async () => {
  const r = await run(implementArgs(), [['cr-prep:app:feat-x:review', { status: 'ready', invoked: true, files: 0, skipped: 1, active: ['`Spec`'] }]])
  assert.deepEqual(status(r), { t1: 'done', t2: 'done' })
  assert.match(r.call('cr:app:feat-x:review:spec').prompt, /`--lens spec --context /)
})

test('ready with no judged file and a non-spec lens is a dead review: branch stays merged', async () => {
  const r = await run(implementArgs(), [['cr-prep:app:feat-x:review', { status: 'ready', invoked: true, files: 0, skipped: 1, active: ['simplicity', 'spec'] }]])
  assert.ok(!r.has('cr:'))
  assert.deepEqual(status(r), { t1: 'merged', t2: 'merged' })
  assert.match(r.result.hil.find((h) => h.stage === 'review').reason, /no judged file/)
})

test('all files skipped and no spec lens: review not applicable, branch done', async () => {
  const r = await run(implementArgs(), [['cr-prep:app:feat-x:review', { status: 'empty', invoked: true, files: 0, skipped: 3, reason: 'every file skipped' }]])
  assert.ok(!r.has('cr:') && !r.has('cr-merge:'))
  assert.match(r.result.branches[0].review.notApplicable, /^review not applicable: every changed file against origin\/main \(3\) is skipped by review$/)
  assert.deepEqual(r.result.hil, [])
  assert.deepEqual(status(r), { t1: 'done', t2: 'done' })
  assert.equal(r.call('mark:app:feat-x').result.marked, true)
})

test('a diff with no file (empty, skipped 0) has no review verdict: branch stays merged', async () => {
  const r = await run(implementArgs(), [['cr-prep:app:feat-x:review', { status: 'empty', invoked: true, files: 0, skipped: 0 }]])
  assert.deepEqual(status(r), { t1: 'merged', t2: 'merged' })
  const h = r.result.hil.find((x) => x.stage === 'review')
  assert.equal(h.kind, 'no-verdict')
  assert.match(h.reason, /the change against origin\/main is empty/)
  assert.ok(!r.has('mark:'))
})

test('an alternate base from cr-prepare goes to a human: branch stays merged', async () => {
  const r = await run(implementArgs(), [['cr-prep:app:feat-x:review', { status: 'empty', invoked: true, files: 0, skipped: 2, alternate: 'origin/dev — 4 files' }]])
  assert.deepEqual(status(r), { t1: 'merged', t2: 'merged' })
  assert.match(r.result.hil.find((h) => h.stage === 'review').reason, /the skill names origin\/dev — 4 files/)
})

test('a lens that judged nothing of a non-empty change makes the review dead', async () => {
  const r = await run(implementArgs(), [['cr:app:feat-x:review:security', { status: 'scanned', invoked: true, filesJudged: 0, filesTotal: 2 }]])
  assert.ok(!r.has('cr-merge:'))
  assert.match(r.result.hil.find((h) => h.stage === 'review').reason, /lens security did not report/)
  assert.deepEqual(status(r), { t1: 'merged', t2: 'merged' })
})

test('a lens that judged part of its files merges and reaches a human as a notice', async () => {
  const r = await run(implementArgs(), [['cr:app:feat-x:review:security', { status: 'scanned', invoked: true, filesJudged: 1, filesTotal: 2 }]])
  assert.ok(r.has('cr-merge:'))
  assert.ok(r.result.hil.some((h) => h.kind === 'review' && /lens security judged 1 of 2 files/.test(h.reason)))
})

test('cr-prep is told to focus the review on the elements and decisions of the branch tasks', async () => {
  const r = await run(implementArgs(), [['cr-merge:app:feat-x:review', crMerged([finding()])]])
  const focus = /read the `elements:` and `decisions:` frontmatter lists of these task files:\n((?:- \S+\n)+)Append `--spec-focus "<codes>"` to the arguments above[^]*When every list is empty, append nothing\./
  for (const label of ['cr-prep:app:feat-x:review', 'cr-prep:app:feat-x:delta']) {
    assert.equal(focus.exec(r.call(label).prompt)?.[1], '- /r/app/tasks/t1.md\n- /r/app/tasks/t2.md\n', label)
  }
})

test('a change of at most three judged files gets one scan agent for every lens', async () => {
  const r = await run(implementArgs(), [['cr-prep:app:feat-x:review', prepReady(['simplicity', '`Security`', 'spec'], 3)]])
  assert.deepEqual(r.callsMatching('cr:').map((c) => c.label), ['cr:app:feat-x:review:all'])
  const scan = r.call('cr:app:feat-x:review:all')
  assert.equal(scan.schema, 'SCAN_ALL_RESULT')
  assert.match(scan.prompt, /`--lens simplicity,security,spec --context \/r\/app\.worktrees\/\.review\/feat-x-review`/)
  assert.ok(r.has('cr-merge:app:feat-x:review'))
  assert.deepEqual(status(r), { t1: 'done', t2: 'done' })
})

test('four judged files keep one scan agent per lens', async () => {
  const r = await run(implementArgs(), [['cr-prep:app:feat-x:review', prepReady(['simplicity', 'security'], 4)]])
  assert.deepEqual(r.callsMatching(/^cr:.*:review:/).map((c) => c.label), ['cr:app:feat-x:review:simplicity', 'cr:app:feat-x:review:security'])
})

test('a lens the single scanner leaves out, or that judged nothing, makes the review dead', async () => {
  const small = ['cr-prep:app:feat-x:review', prepReady(['simplicity', 'security', 'spec'], 2)]
  const missing = await run(implementArgs(), [small, ['cr:app:feat-x:review:all', { invoked: true, lenses: [{ lens: 'simplicity', status: 'scanned', filesJudged: 2, filesTotal: 2 }, { lens: '`Spec`', status: 'scanned', filesJudged: 2, filesTotal: 2 }] }]])
  assert.ok(!missing.has('cr-merge:'))
  assert.match(missing.result.hil.find((h) => h.stage === 'review').reason, /lens security did not report/)
  assert.deepEqual(status(missing), { t1: 'merged', t2: 'merged' })

  const blind = await run(implementArgs(), [small, ['cr:app:feat-x:review:all', (p) => ({ ...scannedAll(p), lenses: scannedAll(p).lenses.map((e) => (e.lens === 'spec' ? { ...e, filesJudged: 0 } : e)) })]])
  assert.match(blind.result.hil.find((h) => h.stage === 'review').reason, /lens spec did not report/)

  const dead = await run(implementArgs(), [small, ['cr:app:feat-x:review:all', { invoked: false, lenses: [] }]])
  assert.match(dead.result.hil.find((h) => h.stage === 'review').reason, /lens simplicity, security, spec did not report/)
})

test('cr-merge incomplete makes the review dead and names the missing lens', async () => {
  const r = await run(implementArgs(), [['cr-merge:app:feat-x:review', { status: 'incomplete', invoked: true, findings: [], missing: ['spec'] }]])
  assert.match(r.result.hil.find((h) => h.stage === 'review').reason, /cr-merge found lens spec missing/)
  assert.deepEqual(status(r), { t1: 'merged', t2: 'merged' })
})

test('CI incomplete: re-dispatched once, then no verdict — never a fix round', async () => {
  const incomplete = (p) => ({ ...ciPass(p), passed: false, incomplete: ['pnpm test — last line: RUN v2'] })
  const r = await run(implementArgs(), [['ci:app:feat-x', incomplete]])
  assert.deepEqual(r.callsMatching(/^ci:/).map((c) => c.label), ['ci:app:feat-x', 'ci:app:feat-x:unfinished'])
  assert.ok(!r.has('fix-'))
  assert.ok(!r.has('cr-prep:'))
  const b = r.result.branches[0]
  assert.equal(b.ci, 'no-verdict')
  assert.equal(b.fixRounds, 0)
  const h = r.result.hil.find((x) => x.stage === 'ci')
  assert.equal(h.kind, 'no-verdict')
  assert.match(h.reason, /returned while pnpm test — last line: RUN v2 had no exit line/)
  assert.ok(r.result.caveats.some((c) => /re-dispatched once/.test(c)))
  assert.deepEqual(status(r), { t1: 'merged', t2: 'merged' })
})

test('CI incomplete then finished on the re-dispatch carries on normally', async () => {
  const incomplete = (p) => ({ ...ciPass(p), passed: false, incomplete: ['pnpm test'] })
  const r = await run(implementArgs({ review: false }), [['ci:app:feat-x:unfinished', ciPass], ['ci:app:feat-x', seq(incomplete, ciPass)]])
  assert.equal(r.result.branches[0].ci, 'passed')
  assert.deepEqual(status(r), { t1: 'done', t2: 'done' })
})

test('full gate incomplete after marking: the marks are taken back, then no verdict', async () => {
  const markedButUnfinished = (p) => ({ ...ciPass(p), passed: false, incomplete: ['pnpm test'], marked: true })
  const r = await run(implementArgs({ review: false }), [['ci:app:feat-x', markedButUnfinished]])
  const unmark = r.callsMatching('unmark:')
  assert.deepEqual(unmark.map((c) => c.label), ['unmark:ci:app:feat-x', 'unmark:ci:app:feat-x'])
  assert.match(unmark[0].prompt, /Set `status: merged`/)
  assert.equal(r.result.branches[0].ci, 'no-verdict')
  assert.deepEqual(status(r), { t1: 'merged', t2: 'merged' })
})

test('CI failure: one fix round, then pass', async () => {
  const r = await run(implementArgs({ review: false }), [
    ['ci:app:feat-x#2', ciPass],
    ['ci:app:feat-x:final', ciPass],
    ['ci:app:feat-x', ciFail(['pnpm test: a.test.ts expected 1 got 2'])],
  ])
  assert.deepEqual(r.callsMatching(/^(ci|fix)/).map((c) => c.label), ['ci:app:feat-x', 'fix-ci:app:feat-x#1', 'ci:app:feat-x#2', 'ci:app:feat-x:final'])
  // A fix round is verified scoped; the full list runs again because the fix moved HEAD.
  assert.match(r.call('ci:app:feat-x#2').prompt, /git diff --name-only origin\/main\.\.\.HEAD/)
  assert.match(r.call('ci:app:feat-x:final').prompt, /Run every command in full/)
  const fix = r.call('fix-ci:app:feat-x#1')
  assert.equal(fix.schema, 'FIX_RESULT')
  assert.match(fix.prompt, /Fix CI problems on branch feat\/x/)
  assert.match(fix.prompt, /- pnpm test: a\.test\.ts expected 1 got 2/)
  assert.match(fix.prompt, /Already failing on the clean base[^\n]*\n- src\/old\.ts:1 TS2322/)
  assert.equal(r.result.branches[0].ci, 'passed')
  assert.equal(r.result.branches[0].fixRounds, 1)
  assert.deepEqual(status(r), { t1: 'done', t2: 'done' })
})

test('CI still failing after maxFixRounds goes to a human as failed', async () => {
  const r = await run(implementArgs({ review: false, maxFixRounds: 2 }), [['ci:app:feat-x:final', ciPass], ['ci:app:feat-x', ciFail(['boom'])]])
  assert.equal(r.callsMatching('fix-ci:').length, 2)
  assert.equal(r.result.branches[0].ci, 'failed')
  assert.match(r.result.hil.find((h) => h.kind === 'ci').reason, /CI still failing after 2 fix rounds: boom/)
  assert.ok(!r.has('ci:app:feat-x:final'))
})

test('maxFixRounds defaults to 3 when absent', async () => {
  const args = implementArgs({ review: false })
  delete args.maxFixRounds
  const r = await run(args, [['ci:app:feat-x:final', ciPass], ['ci:app:feat-x', ciFail(['boom'])]])
  assert.equal(r.callsMatching('fix-ci:').length, 3)
})

test('a fix round that commits nothing stops with "committed nothing"', async () => {
  const r = await run(implementArgs({ review: false }), [
    ['fix-ci:', { summary: 'could not', fromSha: 'same', toSha: 'same', skipped: [] }],
    ['ci:app:feat-x', ciFail(['boom'])],
  ])
  assert.equal(r.callsMatching('fix-ci:').length, 1)
  assert.ok(!r.has('ci:app:feat-x#2'))
  assert.equal(r.result.branches[0].ci, 'failed')
  assert.match(r.result.hil.find((h) => h.kind === 'ci').reason, /fix round 1 committed nothing, so the last verdict stands: boom/)
  assert.ok(r.result.caveats.some((c) => /fix-ci round 1 committed nothing/.test(c)))
})

test('final gate failure gets one fix round, then passes', async () => {
  const r = await run(implementArgs({ review: false }), [
    ['ci:app:feat-x:final#2', ciPass],
    ['ci:app:feat-x:final', ciFail(['stale index'])],
    ['ci:app:feat-x#2', ciPass],
    ['ci:app:feat-x', ciFail(['boom'])],
  ])
  assert.ok(r.has('fix-final:app:feat-x'))
  assert.match(r.call('fix-final:app:feat-x').prompt, /Fix final-gate CI problems/)
  assert.equal(r.result.branches[0].fixRounds, 2)
  assert.deepEqual(status(r), { t1: 'done', t2: 'done' })
})

test('a dirty tree reported as prose is a fault: no verdict', async () => {
  const r = await run(implementArgs(), [['ci:app:feat-x', (p) => ({ ...ciPass(p), dirty: 'nothing to commit, working tree clean' })]])
  const h = r.result.hil.find((x) => x.stage === 'ci')
  assert.equal(h.kind, 'no-verdict')
  assert.match(h.reason, /did not capture `git status --porcelain` \(dirty reads "nothing to commit, working tree clean"\)/)
  assert.ok(!r.has('fix-ci:'))
  assert.equal(r.result.branches[0].ci, 'no-verdict')
})

test('a tracked edit in the tree is a fault; baseline dirt and untracked files are not', async () => {
  const tracked = await run(implementArgs({ review: false }), [['ci:app:feat-x', (p) => ({ ...ciPass(p), dirty: ' M src/a.ts' })]])
  assert.match(tracked.result.hil[0].reason, /left 1 uncommitted change\(s\) in the worktree \(src\/a\.ts\)/)

  const tolerated = await run(implementArgs({ review: false }), [['ci:app:feat-x', (p) => ({ ...ciPass(p), dirty: ' M .cache/tsbuildinfo\n?? snap/new.snap' })]])
  assert.equal(tolerated.result.branches[0].ci, 'passed')
  assert.ok(tolerated.result.caveats.some((c) => /new untracked files \(snap\/new\.snap\)/.test(c)))
})

test('CI that graded another branch is a fault', async () => {
  const r = await run(implementArgs({ review: false }), [['ci:app:feat-x', (p) => ({ ...ciPass(p), branch: 'main' })]])
  assert.match(r.result.hil[0].reason, /ran in a checkout on main instead of feat\/x/)
})

test('a blocked task goes to a human and its dependents are unreachable', async () => {
  const args = implementArgs({ tasks: [task('t1'), task('t2', { dependsOn: ['t1'] }), task('t3', { branch: 'feat/y' })] })
  const r = await run(args, [['wave1:t1', { slug: 't1', outcome: 'blocked', summary: 'stopped', reason: 'needs a production secret' }]])
  assert.deepEqual(status(r), { t1: 'blocked', t2: 'todo', t3: 'done' })
  assert.deepEqual(r.result.unreachable, ['t2'])
  assert.deepEqual(r.result.hil, [{ slug: 't1', kind: 'implementation', reason: 'needs a production secret' }])
  assert.ok(!r.has('wave2:'))
  assert.deepEqual(r.result.branches.map((b) => b.branch), ['feat/y'])
  // Reviewers and fixers see the deliberate gaps, so they never "fix" them.
  const crMerge = r.call('cr-merge:app:feat-y:review').prompt
  assert.match(crMerge, /Open work on this task graph[^\n]*\n- t1 \(Task t1\): needs a production secret\n- t2 \(Task t2\): not implemented yet/)
  assert.match(crMerge, /Set reserved=true/)
})

test('a task blocked before the run is carried over and gates its dependents', async () => {
  const r = await run(implementArgs({ review: false, tasks: [task('t1', { status: 'blocked' }), task('t2', { dependsOn: ['t1'] })] }))
  assert.deepEqual(r.result.hil, [{ slug: 't1', kind: 'carried-over', reason: 'Already blocked before this run.' }])
  assert.deepEqual(r.result.unreachable, ['t2'])
  assert.ok(!r.has('wave'))
})

test('an operational task is human work: marked blocked, listed as human-owned to the waves', async () => {
  const args = implementArgs({ review: false, tasks: [task('ops', { repository: 'none', file: '/r/app/tasks/ops.md' }), task('t1')] })
  const r = await run(args)
  assert.match(r.call('mark-blocked').prompt, /- \/r\/app\/tasks\/ops\.md/)
  assert.equal(r.result.hil[0].kind, 'operational')
  assert.match(r.call('wave1:t1').prompt, /Tasks a human owns in this run[^\n]*\n- ops \(Task ops\): Manual work/)
  assert.deepEqual(status(r), { ops: 'blocked', t1: 'done' })
})

test('done dependencies count as satisfied without a wave', async () => {
  const r = await run(implementArgs({ review: false, tasks: [task('t1', { status: 'done' }), task('t2', { dependsOn: ['t1'] })] }))
  assert.deepEqual(r.logs, ['Wave 1: t2'])
  assert.deepEqual(status(r), { t1: 'done', t2: 'done' })
})

test('stacked units: the stacked branch waits for its base, is refreshed and diffed against it', async () => {
  const args = implementArgs({ tasks: [task('t1', { branch: 'feat/a' }), task('t2', { branch: 'feat/b', baseBranch: 'feat/a' })] })
  const r = await run(args, [['ci:app:feat-b#2', ciPass], ['ci:app:feat-b:final', ciPass], ['ci:app:feat-b', ciFail(['boom'])]])
  assert.match(r.call('ci:app:feat-b#2').prompt, /git diff --name-only feat\/a\.\.\.HEAD/)
  assert.deepEqual(r.logs, ['Wave 1: t1', 'Wave 2: t2'])
  assert.match(r.call('wave2:t2').prompt, /first of these\n {3}refs that exists[^\n]*\n {3}feat\/b, then feat\/a, then origin\/main\./)
  assert.match(r.call('merge2:app').prompt, /- target feat\/b \(stacks on feat\/a, worktree \/r\/app\.worktrees\/feat-b\):/)
  assert.deepEqual(r.result.branches.map((b) => b.branch), ['feat/a', 'feat/b'])
  assert.ok(!r.has('refresh:app:feat-a'))
  const refresh = r.call('refresh:app:feat-b')
  assert.equal(refresh.schema, 'REFRESH_RESULT')
  assert.ok(r.labels.indexOf('mark:app:feat-a') > 0 && r.labels.indexOf('mark:app:feat-a') < r.labels.indexOf('refresh:app:feat-b'))
  assert.match(r.call('cr-prep:app:feat-b:review').prompt, /--base feat\/a /)
  assert.deepEqual(status(r), { t1: 'done', t2: 'done' })
})

test('stacked unit whose base refresh needs a judgment call is skipped', async () => {
  const args = implementArgs({ tasks: [task('t1', { branch: 'feat/a' }), task('t2', { branch: 'feat/b', baseBranch: 'feat/a' })] })
  const r = await run(args, [['refresh:app:feat-b', { refreshed: false, conflict: 'both rename foo' }]])
  assert.equal(r.result.branches[1].ci, 'skipped')
  assert.match(r.result.hil.find((h) => h.stage === 'base-refresh').reason, /needs a judgment call: both rename foo/)
  assert.deepEqual(status(r), { t1: 'done', t2: 'merged' })
})

test('a branch-base no task builds raises one graph item; knownBases silences it', async () => {
  const tasks = [task('t1', { branch: 'feat/b', baseBranch: 'feat/typo' }), task('t2', { branch: 'feat/b', baseBranch: 'feat/typo' })]
  const r = await run(implementArgs({ review: false, tasks }))
  const graph = r.result.hil.filter((h) => h.kind === 'graph')
  assert.equal(graph.length, 1)
  assert.equal(graph[0].slug, null)
  assert.match(graph[0].reason, /`feat\/typo` names a branch no task in \/r\/app builds, so t1, t2 start from it/)

  const known = await run(implementArgs({ review: false, tasks, knownBases: [`${REPO}:feat/typo`] }))
  assert.equal(known.result.hil.filter((h) => h.kind === 'graph').length, 0)
})

test('a merge conflict goes to a human and keeps the task out of validation', async () => {
  const args = implementArgs({ review: false, tasks: [task('t1'), task('t2')] })
  const r = await run(args, [
    ['merge1:app', { branches: [{ branch: 'feat/x', worktree: '/r/app.worktrees/feat-x', mergedSlugs: ['t1'], conflicts: [{ slug: 't2', description: 'both edit config' }], resolved: [] }] }],
  ])
  assert.deepEqual(status(r), { t1: 'done', t2: 'implemented' })
  assert.deepEqual(r.result.hil, [{ slug: 't2', kind: 'merge-conflict', reason: '/r/app feat/x: both edit config' }])
  assert.match(r.call('ci:app:feat-x').prompt, /- \/r\/app\/tasks\/t1\.md\n(?!- \/r\/app\/tasks\/t2)/)
})

test('a task the merge agent left without a verdict becomes a merge item, not an endless loop', async () => {
  const args = implementArgs({ review: false, tasks: [task('t1'), task('t2')] })
  const r = await run(args, [['merge1:app', { branches: [{ branch: 'feat/x', worktree: '/r/app.worktrees/feat-x', mergedSlugs: ['t1'], conflicts: [] }] }]])
  assert.deepEqual(r.result.hil, [{ slug: 't2', kind: 'merge', reason: 'The merge agent for /r/app returned no verdict for this task.' }])
  assert.equal(r.callsMatching(/^merge/).length, 1)
})

test('a branch that touches its toolchain is re-scouted and validated with its own report', async () => {
  const r = await run(implementArgs({ review: false }), [
    ['toolchain-touch:app:feat-x', { touched: true, files: ['package.json'] }],
    ['scout:app:feat-x', '## Commands\n1. pnpm lint'],
  ])
  assert.match(r.call('scout:app:feat-x').prompt, /which changed package\.json/)
  const ci = r.call('ci:app:feat-x').prompt
  assert.match(ci, /<toolchain_report>\n## Commands\n1\. pnpm lint\n<\/toolchain_report>/)
  assert.match(ci, /was detected on the branch itself/)
})

test('a parked branch is validated in a detached worktree and its checkout is protected', async () => {
  const args = implementArgs({ review: false, repos: { [REPO]: { startRef: 'feat/x', diffBase: 'origin/main', parkedBranch: 'feat/x' } } })
  const r = await run(args, [
    ['merge1:app', (p) => ({ branches: [{ branch: 'feat/x', worktree: REPO, mergedSlugs: ['t1'], conflicts: [] }] })],
    ['merge2:app', (p) => ({ branches: [{ branch: 'feat/x', worktree: REPO, mergedSlugs: ['t2'], conflicts: [] }] })],
  ])
  assert.match(r.call('merge1:app').prompt, /worktree \/r\/app — the main checkout/)
  assert.match(r.call('merge1:app').prompt, /\/r\/app is the user's own checkout: never run `git clean`/)
  assert.match(r.call('ci:app:feat-x').prompt, /git worktree add --detach \/r\/app\.worktrees\/feat-x-validate feat\/x/)
  assert.deepEqual(status(r), { t1: 'done', t2: 'done' })
})

test('the toolchain scout dying leaves the repository without a verdict', async () => {
  const r = await run(implementArgs({ review: false }), [['scout:app', null]])
  assert.equal(r.result.hil[0].stage, 'toolchain')
  assert.equal(r.result.branches[0].ci, 'no-verdict')
  assert.ok(!r.has('baseline:') && !r.has('ci:'))
  assert.deepEqual(status(r), { t1: 'merged', t2: 'merged' })
})

test('a baseline that dies is absorbed into a no-verdict item; CI runs without a baseline', async () => {
  const r = await run(implementArgs({ review: false }), [['baseline:app', null]])
  assert.equal(r.result.hil[0].stage, 'baseline')
  assert.match(r.call('ci:app:feat-x').prompt, /<baseline>\nNo baseline is available/)
})

test('a baseline command without a verdict is a caveat and runs in full on the branch', async () => {
  const r = await run(implementArgs({ review: false }), [['baseline:app', { commands: [{ command: 'pnpm test', passed: false, completed: false }], dirty: [] }]])
  assert.ok(r.result.caveats.some((c) => /the baseline left pnpm test without a verdict/.test(c)))
  assert.match(r.call('ci:app:feat-x').prompt, /- pnpm test: NO VERDICT on the clean base/)
})

test('a full gate passing without confirming the marks gets one marking agent, then leaves the tasks merged', async () => {
  const r = await run(implementArgs({ review: false }), [['ci:app:feat-x', (p) => ({ ...ciPass(p), marked: false })], ['mark:', { marked: false }]])
  assert.ok(r.has('mark:app:feat-x'))
  assert.equal(r.result.hil[0].stage, 'done-marking')
  assert.deepEqual(status(r), { t1: 'merged', t2: 'merged' })
})

test('the spec path is passed to cr-prepare as given, never a branch copy', async () => {
  const r = await run(implementArgs())
  for (const c of r.callsMatching('cr-prep:')) {
    assert.match(c.prompt, new RegExp(`--spec ${SPEC.replace(/[./]/g, '\\$&')}\``))
    assert.doesNotMatch(c.prompt, /cat-file|git show [^\n]*spec/)
  }
})

test('an unreviewed branch whose first full run named no head is not gated a second time', async () => {
  const r = await run(implementArgs({ review: false }), [[/^ci:/, (p, o) => ({ ...ciPass(p, o), head: '' })]])
  assert.ok(!r.has('ci:app:feat-x:final'))
  assert.match(r.call('ci:app:feat-x').prompt, /set `status: done`/)
  assert.deepEqual(status(r), { t1: 'done', t2: 'done' })
})
