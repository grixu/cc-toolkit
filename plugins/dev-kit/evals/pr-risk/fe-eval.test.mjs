import assert from 'node:assert/strict'
import test from 'node:test'
import { answersOf, decodeRows, metrics, pairedCI, predict } from './fe-eval.mjs'

const wireAt = (level) => ({ score: level, probabilities: { [String(level)]: 1 } })
const at = (level) => ({ type: 'scale', expected: level, probabilities: [0, 1, 2, 3, 4].map((i) => +(i === level)) })

test('merges each repeat\'s bodies, then averages the repeats, skipping refusals', () => {
  const rows = [
    { twin: 't', repeat: 1, answers: { complexity: wireAt(1) } },
    { twin: 't', repeat: 1, answers: { automation_testable: { noul: 0.2 } } },
    { twin: 't', repeat: 2, answers: { complexity: wireAt(3) } },
    { twin: 't', repeat: 2, answers: { automation_testable: { noul: 0.6 } } },
    { twin: 'u', repeat: 1, refused: true },
  ]
  const a = answersOf(decodeRows(rows))
  assert.deepEqual(a.t.complexity.probabilities, [0, 0.5, 0, 0.5, 0])
  assert.ok(Math.abs(a.t.automation_testable.p - 0.4) < 1e-9)
  assert.equal(a.u, undefined)
})

test('counts under-estimates twice and an unpredicted case as medium', () => {
  const labels = [{ id: 'a', level: 'high', weight: 1 }, { id: 'b', level: 'low', weight: 1 }]
  const m = metrics([{ a: { level: 'low' } }], labels)
  assert.equal(m.cost, (4 + 1) / 2)
  assert.equal(m.under, 0.5)
  assert.equal(m.dangerousW, 1)
  assert.deepEqual(pairedCI([{ a: { level: 'low' } }], [{ a: { level: 'high' } }], labels, { a: 'r', b: 'r' }).delta, -2)
})

test('scores a case from its bindings and falls back when no part answered', () => {
  const state = { files: ['src/a.ts'], diff: 'x' }
  const d = {
    control: [{ c1: { status: 'completed', predicted: 'high' }, c2: { status: 'completed', predicted: 'medium' }, c3: { status: 'failed' } }],
    inputs: [{ c1: [0, 0, 0, [], ['src/a.ts'], new Map(), new Set()], c2: [0, 0, 0, [], ['src/b.ts'], new Map(), new Set()], c3: [0, 0, 0, [], [], new Map(), new Set()] }],
    bindings: [{ side: 'r1', id: 'c1', twin: 't1', state }, { side: 'r1', id: 'c2', twin: 't2', state }],
    frozenStates: [{ twin: 't1', testOnly: false }, { twin: 't2', testOnly: false }],
    prs: {},
  }
  const [round] = predict(d, { t1: { complexity: at(4), defect_impact: at(4) } }, ['c1', 'c2', 'c3'])
  assert.deepEqual(round.c1, { level: 'critical', scorer: 'factors', credited: false, partial: false })
  assert.deepEqual(round.c2, { level: 'medium', scorer: 'two-axis fallback' })
  assert.equal(round.c3, undefined)
})
