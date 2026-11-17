import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SKIP_FACTS, STORY_FACTS } from '../../hooks/story.ts'
import { combineRuns, fit, leaveOneOut, skipped, tally } from './metrics.mjs'

const facts = (skip, story) => ({
  ...Object.fromEntries(Object.keys(SKIP_FACTS).map((k) => [k, k === 'localized_fix' ? skip : 0])),
  ...Object.fromEntries(Object.keys(STORY_FACTS).map((k) => [k, k === 'new_or_restructured_flow' ? story : 0])),
})
const pr = (id, label, skip, story) => ({ id, label, tooLarge: false, facts: facts(skip, story) })

test('repeat runs are averaged per PR, and a PR failed in any run fails', () => {
  const runs = [
    [{ id: 'a', ok: true, facts: { localized_fix: 1 } }, { id: 'b', ok: true, facts: { localized_fix: 1 } }],
    [{ id: 'a', ok: true, facts: { localized_fix: 0.5 } }, { id: 'b', ok: false, error: 'timeout' }],
  ]
  const [a, b] = combineRuns(runs)
  assert.equal(a.facts.localized_fix, 0.75)
  assert.deepEqual(b, { id: 'b', ok: false, error: 'timeout' })
})

test('a too-large PR is never skipped, and a story fact over its threshold beats any skip fact', () => {
  const t = { skipAt: 0.8, storyAt: 0.9 }
  assert.equal(skipped({ tooLarge: true, facts: {} }, t), false)
  assert.equal(skipped(pr('x', 'skip', 0.95, 0.5), t), true)
  assert.equal(skipped(pr('x', 'skip', 0.95, 0.92), t), false)
})

test('the fit never skips a story PR and takes the most skips, then the highest skipAt', () => {
  const cases = [pr('s1', 'story', 0.7, 0.2), pr('k1', 'skip', 0.9, 0.1), pr('k2', 'skip', 0.6, 0.1), pr('k3', 'skip', 0.95, 0.95)]
  const t = fit(cases)
  assert.deepEqual(tally(cases, t), { skips: 2, skipTotal: 3, storySkipped: 0, storyTotal: 1 })
  assert.equal(t.skipAt, 0.9)
  assert.equal(t.storyAt, 1.01)
})

test('leave-one-out refits without the held-out PR and names every miss', () => {
  const cases = [pr('s1', 'story', 0.7, 0.2), pr('s2', 'story', 0.92, 0.2), pr('k1', 'skip', 0.9, 0.1), pr('k2', 'skip', 0.95, 0.1)]
  const loo = leaveOneOut(cases)
  assert.equal(loo.storySkipped, 1)
  assert.equal(loo.skips, 1)
  assert.deepEqual(loo.misses, ['s2 skipped (story)', 'k1 kept (skip)'])
})
