import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runWorkflow } from './harness.mjs'
import { implementArgs, implementDefaults, finding, line, crMerged } from './fixtures.mjs'

const F = {
  plain: finding({ location: 'src/plain.ts:L1' }),
  security: finding({ family: 'security', rule: 'sql-injection', location: 'src/sec.ts:L1' }),
  securityDecorated: finding({ family: '`Security`', severity: ' High ', rule: 'xss', location: 'src/sec2.ts:L1' }),
  spec: finding({ family: 'spec', rule: 'scope-creep', risk: 'structural', location: 'src/spec.ts:L1' }),
  specDecorated: finding({ family: '`Spec`', severity: 'MEDIUM', rule: 'scope-creep', location: 'src/spec2.ts:L1' }),
  access: finding({ family: 'security', rule: 'missing-authz', access: true, location: 'src/acl.ts:L1' }),
  specBound: finding({ family: 'correctness', rule: 'off-by-one', risk: 'structural', specBound: true, location: 'src/bound.ts:L1' }),
  reportOnly: finding({ family: 'performance', severity: 'medium', rule: 'n-plus-one', risk: 'report-only', location: 'src/perf.ts:L1' }),
  boyScoutSafe: finding({ rule: 'unused-import', boyScout: true, location: 'src/old.ts:L1' }),
  boyScoutStructural: finding({ rule: 'god-object', risk: 'structural', boyScout: true, location: 'src/old2.ts:L1' }),
  move: finding({ severity: 'comment', family: 'comments', rule: 'R3 · MOVE', risk: 'structural', fix: 'move it to the call site', location: 'src/c1.ts:L1' }),
  keep: finding({ severity: 'comment', family: 'comments', rule: 'R2 · `KEEP`', risk: 'safe', fix: 'keep', location: 'src/c2.ts:L1' }),
  deleteComment: finding({ severity: 'Comment', family: 'comments', rule: 'R1 · DELETE', risk: 'safe', fix: 'delete it', location: 'src/c3.ts:L1' }),
  boyScoutComment: finding({ severity: 'comment', family: 'comments', rule: 'R1 · DELETE', risk: 'safe', boyScout: true, fix: 'delete it', location: 'src/c4.ts:L1' }),
  nit: finding({ severity: 'nit', rule: 'naming', location: 'src/nit.ts:L1' }),
}

const runReview = (review, findings, rules = [], options) =>
  runWorkflow('implement-run.js', implementArgs({ review }), [...rules, ['cr-merge:app:feat-x:review', crMerged(findings)], ...implementDefaults()], options)

// Where each finding ended up: in the fixer's problem list, on the HIL list, only in the report, or
// nowhere at all.
const routes = (r) => {
  const fix = r.calls.find((c) => c.label === 'fix-cr:app:feat-x')
  const hil = r.result.hil.filter((h) => h.kind === 'review').map((h) => h.reason)
  const listed = r.result.branches[0].findings
  return Object.fromEntries(
    Object.entries(F).map(([name, f]) => {
      const l = line(f)
      if (fix && fix.prompt.includes(`- ${l}`)) return [name, 'applied']
      if (hil.some((h) => h.includes(l))) return [name, 'human']
      if (listed.includes(l)) return [name, 'reported']
      return [name, 'dropped']
    }),
  )
}
const status = (r) => r.result.tasks.map((t) => t.status)

test('review true: unattended run fixes the safe and security findings, holds spec, access, spec-bound and moves for a human', async () => {
  const r = await runReview(true, Object.values(F))
  assert.deepEqual(routes(r), {
    plain: 'applied',
    security: 'applied',
    securityDecorated: 'applied',
    spec: 'human',
    specDecorated: 'human',
    access: 'human',
    specBound: 'human',
    reportOnly: 'human',
    boyScoutSafe: 'applied',
    boyScoutStructural: 'human',
    move: 'human',
    keep: 'dropped',
    deleteComment: 'applied',
    boyScoutComment: 'applied',
    nit: 'reported',
  })
  const review = r.result.branches[0].review
  assert.deepEqual([review.applied, review.forHuman, review.reported, review.reserved], [6, 7, 1, 0])
  assert.equal(r.result.branches[0].reviewFindings, Object.keys(F).length)
  for (const h of r.result.hil) assert.match(h.reason, /left for the end-of-run decision; the branch is not held on it$/)
  assert.deepEqual(status(r), ['done', 'done'])
  assert.match(r.call('fix-cr:app:feat-x').prompt, /Commit each `security` finding's fix on its own/)
})

test('review "gated": security, boy-scout and every non-safe finding wait for a human, and the branch is held', async () => {
  const r = await runReview('gated', Object.values(F))
  assert.deepEqual(routes(r), {
    plain: 'applied',
    security: 'human',
    securityDecorated: 'human',
    spec: 'human',
    specDecorated: 'human',
    access: 'human',
    specBound: 'human',
    reportOnly: 'human',
    boyScoutSafe: 'human',
    boyScoutStructural: 'human',
    move: 'human',
    keep: 'dropped',
    deleteComment: 'applied',
    boyScoutComment: 'reported',
    nit: 'reported',
  })
  for (const h of r.result.hil) assert.match(h.reason, /the branch keeps status merged until a repair settles it$/)
  assert.doesNotMatch(r.call('ci:app:feat-x:final').prompt, /set `status: done`/)
  assert.deepEqual(status(r), ['merged', 'merged'])
})

test('review "gated" with only fixable findings marks the branch done', async () => {
  const r = await runReview('gated', [F.plain, F.deleteComment, F.nit, F.keep])
  assert.deepEqual(r.result.hil, [])
  assert.deepEqual(status(r), ['done', 'done'])
})

test('review false: no review agent, findings never computed', async () => {
  const r = await runReview(false, Object.values(F))
  assert.ok(!r.has('cr-prep:') && !r.has('cr-merge:') && !r.has('fix-cr:'))
  assert.deepEqual(r.result.branches[0].findings, [])
  assert.deepEqual(status(r), ['done', 'done'])
})

test('only human-bound findings: no fixer and no delta review', async () => {
  const r = await runReview(true, [F.spec, F.move])
  assert.ok(!r.has('fix-cr:') && !r.has('cr-prep:app:feat-x:delta'))
  assert.equal(r.result.hil.length, 2)
  assert.deepEqual(status(r), ['done', 'done'])
})

test('a reserved finding is counted, never routed', async () => {
  const reserved = finding({ location: 'src/gap.ts:L1', reserved: true })
  const r = await runReview(true, [reserved])
  assert.equal(r.result.branches[0].review.reserved, 1)
  assert.deepEqual(r.result.branches[0].findings, [])
  assert.ok(!r.has('fix-cr:'))
})

test('a finding the fixer declined goes to a human; an unlisted skip is held in gated mode', async () => {
  const ungated = await runReview(true, [F.plain], [['fix-cr:', { summary: 'skipped', fromSha: 'a', toSha: 'b', skipped: [line(F.plain)] }]])
  assert.match(ungated.result.hil[0].reason, new RegExp(`${line(F.plain).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} — left for the end-of-run decision`))
  assert.deepEqual(status(ungated), ['done', 'done'])

  const gated = await runReview('gated', [F.plain], [['fix-cr:', { summary: 'skipped', fromSha: 'a', toSha: 'b', skipped: ['something reworded'] }]])
  assert.match(gated.result.hil[0].reason, /something reworded — the fixer left it unfixed; the branch keeps status merged/)
  assert.deepEqual(status(gated), ['merged', 'merged'])
})

test('delta review findings, applied or not, go to a human — never a second fixer', async () => {
  const deltaFinding = finding({ location: 'src/fix.ts:L9', rule: 'dead-code' })
  const r = await runReview(true, [F.plain], [['cr-merge:app:feat-x:delta', crMerged([deltaFinding, F.nit])]])
  assert.equal(r.callsMatching('fix-cr:').length, 1)
  assert.equal(r.result.branches[0].review.delta.findings, 1)
  assert.ok(r.result.hil.some((h) => h.reason.includes(line(deltaFinding))))
  assert.ok(!r.result.hil.some((h) => h.reason.includes(line(F.nit))))
})

test('an empty delta review is not a dead review', async () => {
  const r = await runReview(true, [F.plain], [['cr-prep:app:feat-x:delta', { status: 'empty', invoked: true, files: 0, skipped: 0 }]])
  assert.deepEqual(r.result.hil, [])
  assert.deepEqual(status(r), ['done', 'done'])
})

test('a fixer with no starting commit leaves the review fixes without a verdict', async () => {
  const r = await runReview(true, [F.plain], [['fix-cr:', { summary: 'done', toSha: 'b' }]], { checkSchemas: false })
  assert.ok(!r.has('cr-prep:app:feat-x:delta'))
  assert.match(r.result.hil.find((h) => h.stage === 'review').reason, /the fix agent did not report its starting commit/)
  assert.deepEqual(status(r), ['merged', 'merged'])
})

test('unowned lines and the security-review pointer reach the HIL list', async () => {
  const r = await runReview(true, [], [['cr-merge:app:feat-x:review', { ...crMerged([]), unowned: ['unowned: src/x.ts:L2 leaks a handle'], securityReview: '2 files skipped' }]])
  const reasons = r.result.hil.map((h) => h.reason)
  assert.ok(reasons.some((x) => /unowned: src\/x\.ts:L2 leaks a handle — a real problem no review rule covers/.test(x)))
  assert.ok(reasons.some((x) => /run \/security-review: 2 files skipped/.test(x)))
  assert.deepEqual(status(r), ['done', 'done'])

  const gated = await runReview('gated', [], [['cr-merge:app:feat-x:review', { ...crMerged([]), securityReview: '2 files skipped' }]])
  assert.deepEqual(status(gated), ['merged', 'merged'])
})

test('cr-merge prompt asks for the routing flags the filters read', async () => {
  const r = await runReview(true, [])
  const p = r.call('cr-merge:app:feat-x:review').prompt
  assert.match(p, /boyScout=true/)
  assert.match(p, /access=true/)
  assert.match(p, /specBound=true/)
  assert.equal(r.call('cr-merge:app:feat-x:review').schema, 'CR_MERGE_RESULT')
})

test('coherence and assumptions findings pass the cr-merge family enum and are fixed like any lens', async () => {
  const found = [
    finding({ family: 'coherence', rule: 'doc-drift', location: 'docs/flags.md:L3' }),
    finding({ family: 'assumptions', rule: 'version-skew', location: 'src/dep.ts:L9' }),
  ]
  const r = await runReview(true, found)
  const { family } = r.call('cr-merge:app:feat-x:review').opts.schema.properties.findings.items.properties
  for (const f of found) {
    assert.ok(family.enum.includes(f.family), f.family)
    assert.ok(r.call('fix-cr:app:feat-x').prompt.includes(`- ${line(f)}`), f.family)
  }
})
