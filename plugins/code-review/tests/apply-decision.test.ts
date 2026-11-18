import { expect, test } from 'claude-code/testing'
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
  expect(findingLine(FINDING)).toBe('high · simplicity · over-complex · src/checkout/total.ts:L18, L34 · structural')
  expect(findingLine({ ...FINDING, lines: '12-14', boyScout: true })).toBe(
    'high · simplicity · over-complex · src/checkout/total.ts:L12-14 · structural · boy-scout',
  )
  expect(findingLine({ path: 'a.ts' })).toBe('a.ts')
})

test('every key the questions name is one the input can carry', () => {
  const input = applyDecisionInput(FINDING, { scope: 'committed', conventions: 'c', spec: 's', changedFiles: ['src/checkout/total.ts'] })
  const named = new Set(Object.values(APPLY_QUESTIONS).flatMap((q) => [...JSON.stringify(q).matchAll(/`([\w.]+)`/g)].map((m) => m[1])))
  for (const key of named) expect([key, key.split('.').reduce((o: any, k) => o?.[k], input) !== undefined]).toEqual([key, true])
})

test('missing and blank fields are left out rather than sent empty', () => {
  const input = applyDecisionInput({ fix: 'Rename x to total.', problem: '  ', excerpt: null })
  expect(Object.keys(input)).toEqual(['proposed_fix'])
  expect(applyDecisionInput(FINDING).change).toBeUndefined()
})

test('each field is cut to its budget', () => {
  const input = applyDecisionInput({ ...FINDING, excerpt: 'x'.repeat(50_000) }, { conventions: 'y'.repeat(9000) })
  expect((input.code as string).length).toBe(FIELD_BUDGET.code)
  expect((input.code as string).endsWith('… [cut]')).toBe(true)
  expect((input.change as Record<string, string>).conventions.length).toBe(FIELD_BUDGET.conventions)
})

test('the request carries the apply questions', () => {
  expect(applyDecisionRequest(FINDING).questions).toBe(APPLY_QUESTIONS)
})

test('a fix that needs no outside fact and has one natural remedy applies on either backend', () => {
  for (const t of Object.values(THRESHOLDS)) expect(walkDecision(ANSWERS(), t)).toEqual({ decision: 'apply', reasons: [] })
})

test('each gate on its own sends the fix to the owner', () => {
  for (const over of [{ needs_owner_facts: 0.8 }, { remedy_choice: 0.8 }]) {
    const result = walkDecision(ANSWERS(over), THRESHOLDS.gemini)
    expect([over, result.decision, result.reasons.length]).toEqual([over, 'ask', 1])
  }
})

test('a long changed-file list is cut to its budget with a count of the rest', () => {
  const files = Array.from({ length: 500 }, (_, i) => `src/module-${i}/file.ts`)
  const listed = (applyDecisionInput(FINDING, { changedFiles: files }).change as { changed_files: string[] }).changed_files
  expect(listed.join(' , ').length <= FIELD_BUDGET.changed_files + 20).toBe(true)
  expect(listed.at(-1)!).toMatch(/^… \d+ more$/)
})

test('a missing answer asks', () => {
  const answers = ANSWERS()
  delete answers.remedy_choice
  expect(walkDecision(answers, THRESHOLDS.typesafe)).toEqual({ decision: 'ask', reasons: ['an answer is missing'] })
})
