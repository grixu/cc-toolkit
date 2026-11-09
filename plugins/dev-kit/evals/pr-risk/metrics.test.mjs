import assert from 'node:assert/strict'
import { test } from 'node:test'
import { completionStatus, summarizeExperimental, summarizeMetrics, wilson95 } from './metrics.mjs'

test('failed matching predictions and partial reports never count as correct', () => {
  const metrics = summarizeMetrics([
    { id: 'complete', expected: 'low', predicted: 'low' },
    { id: 'policy-error', expected: 'medium', predicted: 'medium', error: 'missing recorded policy request' },
    { id: 'partial', expected: 'high', predicted: 'high', coverage: { partial: true } },
    { id: 'missing', expected: 'critical' },
    { id: 'prep-error', expected: 'high', error: 'clone failed' },
    { id: 'intent-incomplete', expected: 'low', predicted: 'low', complete: false },
    { id: 'unlabelled', predicted: 'medium' },
  ])
  assert.deepEqual(metrics.labelled, { total: 6, answered: 4, completed: 1, failed: 2, incomplete: 3 })
  assert.equal(metrics.total, 7)
  assert.equal(metrics.answered, 5)
  assert.equal(metrics.endToEndExactAccuracy.correct, 1)
  assert.equal(metrics.endToEndExactAccuracy.total, 6)
  assert.equal(metrics.endToEndExactAccuracy.rate, 1 / 6)
  assert.equal(metrics.completeAssessmentAccuracy.rate, 1)
  assert.equal(metrics.completeAssessmentCoverage, 1 / 6)
  assert.equal(metrics.confusion.medium.failed, 1)
  assert.equal(metrics.confusion.high.incomplete, 1)
  assert.equal(metrics.perClass.low.recall, 0.5)
})

test('confusion, per-class support and dangerous underestimates include failures explicitly', () => {
  const metrics = summarizeMetrics([
    { id: 'high-to-low', expected: 'high', predicted: 'low' },
    { id: 'critical-to-medium', expected: 'critical', predicted: 'medium', complete: false },
    { id: 'critical-right', expected: 'critical', predicted: 'critical' },
    { id: 'low-to-critical', expected: 'low', predicted: 'critical' },
  ])
  assert.equal(metrics.confusion.high.low, 1)
  assert.equal(metrics.confusion.critical.incomplete, 1)
  assert.deepEqual(metrics.perClass.critical, { support: 2, predicted: 2, tp: 1, fp: 1, fn: 1, precision: 0.5, recall: 0.5 })
  assert.equal(metrics.dangerousUnderestimates.count, 2)
  assert.equal(metrics.dangerousUnderestimates.completed, 1)
  assert.equal(metrics.dangerousUnderestimates.rate, 2 / 3)
  assert.equal(metrics.dangerousUnderestimates.cases[1].status, 'incomplete')
})

test('empty metrics and classes with no predictions use null rates', () => {
  const metrics = summarizeMetrics([])
  assert.equal(metrics.endToEndExactAccuracy.rate, null)
  assert.equal(metrics.endToEndExactAccuracy.wilson95, null)
  assert.equal(metrics.completeAssessmentCoverage, null)
  assert.equal(metrics.perClass.high.precision, null)
  assert.equal(metrics.perClass.high.recall, null)
  assert.equal(metrics.dangerousUnderestimates.rate, null)
})

test('invalid labels fail loudly instead of disappearing from the denominator', () => {
  assert.throws(() => summarizeMetrics([{ id: 'bad', expected: 'moderate', predicted: 'low' }]), /Unknown expected level/)
  assert.equal(completionStatus({ predicted: 'bogus' }), 'incomplete')
})

test('Wilson 95% intervals match known values at boundaries and a development-sized sample', () => {
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`)
  close(wilson95(0, 10).upper, 0.2775327999)
  close(wilson95(10, 10).lower, 0.7224672001)
  close(wilson95(90, 94).lower, 0.8956435422)
  close(wilson95(90, 94).upper, 0.9833294518)
  assert.equal(wilson95(0, 0), null)
  assert.throws(() => wilson95(11, 10), RangeError)
  assert.throws(() => wilson95(0.5, 1), RangeError)
})

test('experimental completeness stays separate and missing reports or answers cannot count as complete', () => {
  const report = (status, answers) => ({ version: 'atomic-v1', status, signals: [{ answers }] })
  const summary = summarizeExperimental([
    { experimental: report('complete', { boundary: { status: 'unknown' }, effect: { status: 'absent' } }) },
    { experimental: report('incomplete', { boundary: { status: 'present' }, effect: { status: 'missing' } }) },
    { error: 'API failed' },
    { experimental: report('complete', {}) },
    { experimental: { version: 'atomic-v1', status: 'complete', signals: [] } },
  ], 'atomic-v1', ['boundary', 'effect'])
  assert.deepEqual(summary, { version: 'atomic-v1', requested: 5, completed: 1, incomplete: 4, missingReports: 2,
    signals: { present: 1, absent: 1, unknown: 1, missing: 3 } })
  assert.equal(summarizeExperimental([], undefined, []), undefined)
})
