import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runWorkflow, seq } from './harness.mjs'
import { implementArgs, implementDefaults } from './fixtures.mjs'

const withoutRule = (prefix) => implementDefaults().filter(([p]) => p !== prefix)

test('an unscripted label fails the run, naming the label', async () => {
  await assert.rejects(runWorkflow('implement-run.js', implementArgs(), withoutRule('toolchain-touch:')), /unscripted agent call: toolchain-touch:app:feat-x/)
})

test('an unscripted label the script absorbs still fails the run', async () => {
  // The baseline pass catches its own errors into a HIL item, which would hide a changed label.
  await assert.rejects(runWorkflow('implement-run.js', implementArgs({ review: false }), withoutRule('baseline:')), /unscripted agent call\(s\): baseline:app/)
})

test('a reply missing a required key fails the run unless schema checks are off', async () => {
  const rules = [['wave1:t1', { slug: 't1', outcome: 'implemented' }], ...implementDefaults()]
  await assert.rejects(runWorkflow('implement-run.js', implementArgs({ review: false }), rules), /wave1:t1: reply lacks \$\.summary/)
  const r = await runWorkflow('implement-run.js', implementArgs({ review: false }), rules, { checkSchemas: false })
  assert.equal(r.result.tasks[0].status, 'done')
})

test('calls record label, phases, options, schema name and prompt', async () => {
  const r = await runWorkflow('implement-run.js', implementArgs({ review: false }), implementDefaults())
  const ci = r.call('ci:app:feat-x')
  assert.equal(ci.phase, 'Validate')
  assert.equal(ci.runPhase, 'Validate')
  assert.equal(ci.schema, 'CI_RESULT')
  assert.equal(ci.model, 'haiku')
  assert.match(ci.prompt, /^Do only the step/)
  assert.equal(ci.result.passed, true)
  assert.throws(() => r.call('ci:'), /expected one call for ci:/)
})

test('seq answers the nth call with the nth reply and repeats the last', () => {
  const f = seq('a', 'b')
  assert.deepEqual([0, 1, 2].map((n) => f('', {}, n)), ['a', 'b', 'b'])
})
