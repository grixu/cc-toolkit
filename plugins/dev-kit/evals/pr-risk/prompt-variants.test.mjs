import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CHARACTERS, questions } from '../../hooks/risk.ts'
import { CAUSAL_IMPACT_INSTRUCTIONS, SEMANTIC_LIKELIHOOD_INSTRUCTIONS, rewritePrompt, validateVariant } from './prompt-variants.mjs'
import { V2_TYPES } from './v2-types.mjs'

const request = { model: 'jev-pinned', questions: questions(), state: { slice: 'example', diff: 'changed code', execution_context: ['evidence'] } }
const body = JSON.stringify(request)
const rewrite = (variant, payload = body, extra = {}) => rewritePrompt(payload, { variant, characters: CHARACTERS, ...extra })

test('causal variant changes only the impact instruction in a diff request', () => {
  const actual = JSON.parse(rewrite('causal-impact-v1'))
  const expected = structuredClone(request)
  expected.questions.defect_impact.instructions = 'If the change in `diff` contains a mistake, what is the worst consequence once it is deployed? Base the consequence on a path from the changed behavior supported by the diff or provided execution context; a security or data domain alone does not establish that path, and stated intent does not establish implementation.'
  assert.equal(CAUSAL_IMPACT_INSTRUCTIONS, expected.questions.defect_impact.instructions)
  assert.deepEqual(actual, expected)
  assert.deepEqual(JSON.parse(rewrite('dominance')), request)
})

test('semantic variant changes only the likelihood instruction in a diff request', () => {
  const actual = JSON.parse(rewrite('semantic-likelihood-v1'))
  const expected = structuredClone(request)
  expected.questions.defect_likelihood.instructions = 'How likely is the change in `diff` to contain a mistake? Apply the likelihood criteria to the distinct assumptions needed for the changed behavior to be correct and how those assumptions interact, using the diff or provided execution context. Count repeated applications of the same rule once. Distinguish assumptions about an external contract from interactions that depend on order, timing or state; ground these dependencies in the changed behavior rather than edit length or domain terminology.'
  assert.equal(SEMANTIC_LIKELIHOOD_INSTRUCTIONS, expected.questions.defect_likelihood.instructions)
  assert.deepEqual(actual, expected)
})

test('variants leave non-diff requests untouched and reject unknown names', () => {
  const intent = JSON.stringify({ state: { context: 'intent' }, questions: {} }, null, 2)
  const policy = JSON.stringify({ state: { testing_policy: 'rules' }, questions: {} }, null, 2)
  for (const variant of ['dominance', 'presence', 'v2', 'causal-impact-v1', 'semantic-likelihood-v1']) {
    validateVariant(variant)
    assert.equal(rewrite(variant, intent), intent)
    assert.equal(rewrite(variant, policy), policy)
  }
  assert.throws(() => validateVariant('causal-impact-vl'), /--variant must be one of/)
  assert.throws(() => rewrite('causal-impact-vl'), /--variant must be one of/)
  assert.throws(() => rewrite('causal-impact-v1', JSON.stringify({ state: { diff: '' }, questions: {} })), /lacks defect_impact/)
  assert.throws(() => rewrite('semantic-likelihood-v1', JSON.stringify({ state: { diff: '' }, questions: {} })), /lacks defect_likelihood/)
})

test('legacy variants and optional diff context retain their behavior', () => {
  const presence = JSON.parse(rewrite('presence'))
  for (const [key, value] of Object.entries(CHARACTERS))
    assert.deepEqual(presence.questions[key], { type: 'noul', instructions: `\`diff\` adds or changes ${value.subject}.` })
  assert.deepEqual(presence.questions.defect_impact, request.questions.defect_impact)
  const v2 = JSON.parse(rewrite('v2'))
  assert.deepEqual(Object.keys(v2.questions), [...Object.keys(request.questions).filter((key) => key.startsWith('defect_')), ...Object.keys(V2_TYPES)])
  assert.deepEqual(v2.questions.defect_impact, request.questions.defect_impact)
  assert.deepEqual(JSON.parse(rewrite('dominance', body, { diffContext: true, context: 'description' })).state, { context: 'description', ...request.state })
})
