import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Answers } from '../hooks/decision.ts'
import {
  APPLY_QUESTIONS,
  THRESHOLDS,
  FIELD_BUDGET,
  applyDecisionInput,
  applyDecisionRequest,
  findingLine,
  walkDecision,
} from '../hooks/apply-decision.ts'

const FINDING = {
  severity: 'high',
  family: 'simplicity',
  rule: 'over-complex',
  path: 'src/checkout/total.ts',
  lines: 'L18, L34',
  risk: 'structural' as const,
  problem: 'two copies of the tier discount drift apart',
  fix: 'Collapse both branches into discountFor(tier) and call it at each site.',
  excerpt: '18\tif (tier === "gold") {',
  hunk: '@@ -16,3 +16,5 @@\n+if (tier === "gold") {',
}

const ANSWERS = (over: Partial<Record<string, number>> = {}): Answers => ({
  needs_owner_facts: { type: 'binary', p: over.needs_owner_facts ?? 0.02 },
  remedy_choice: { type: 'binary', p: over.remedy_choice ?? 0.02 },
})

test('the finding line has the shape cr-merge returns', () => {
  assert.equal(findingLine(FINDING), 'high · simplicity · over-complex · src/checkout/total.ts:L18, L34 · structural')
  assert.equal(
    findingLine({ ...FINDING, lines: '12-14', boyScout: true }),
    'high · simplicity · over-complex · src/checkout/total.ts:L12-14 · structural · boy-scout',
  )
  assert.equal(findingLine({ path: 'a.ts' }), 'a.ts')
})

test('every key the questions name is one the input can carry', () => {
  const input = applyDecisionInput(FINDING, { scope: 'committed', conventions: 'c', spec: 's', changedFiles: ['src/checkout/total.ts'] })
  const named = new Set(Object.values(APPLY_QUESTIONS).flatMap((q) => [...JSON.stringify(q).matchAll(/`([\w.]+)`/g)].map((m) => m[1])))
  for (const key of named) assert.ok(key.split('.').reduce((o: any, k) => o?.[k], input) !== undefined, key)
})

test('missing and blank fields are left out rather than sent empty', () => {
  const input = applyDecisionInput({ fix: 'Rename x to total.', problem: '  ', excerpt: null })
  assert.deepEqual(Object.keys(input), ['proposed_fix'])
  assert.equal(applyDecisionInput(FINDING).change, undefined)
})

test('each field is cut to its budget', () => {
  const input = applyDecisionInput({ ...FINDING, excerpt: 'x'.repeat(50_000) }, { conventions: 'y'.repeat(9000) })
  assert.equal((input.code as string).length, FIELD_BUDGET.code)
  assert.ok((input.code as string).endsWith('… [cut]'))
  assert.equal((input.change as Record<string, string>).conventions.length, FIELD_BUDGET.conventions)
})

test('the request carries the apply questions', () => {
  assert.equal(applyDecisionRequest(FINDING).questions, APPLY_QUESTIONS)
})

test('a fix that needs no outside fact and has one natural remedy applies on either backend', () => {
  for (const t of Object.values(THRESHOLDS)) assert.deepEqual(walkDecision(ANSWERS(), t), { decision: 'apply', reasons: [] })
})

test('each gate on its own sends the fix to the owner', () => {
  for (const over of [{ needs_owner_facts: 0.8 }, { remedy_choice: 0.8 }]) {
    const result = walkDecision(ANSWERS(over), THRESHOLDS.gemini)
    assert.equal(result.decision, 'ask')
    assert.equal(result.reasons.length, 1, JSON.stringify(over))
  }
})

test('a long changed-file list is cut to its budget with a count of the rest', () => {
  const files = Array.from({ length: 500 }, (_, i) => `src/module-${i}/file.ts`)
  const listed = (applyDecisionInput(FINDING, { changedFiles: files }).change as { changed_files: string[] }).changed_files
  assert.ok(listed.join(' , ').length <= FIELD_BUDGET.changed_files + 20)
  assert.match(listed.at(-1)!, /^… \d+ more$/)
})

test('a missing answer asks', () => {
  const answers = ANSWERS()
  delete answers.remedy_choice
  assert.deepEqual(walkDecision(answers, THRESHOLDS.typesafe), { decision: 'ask', reasons: ['an answer is missing'] })
})
