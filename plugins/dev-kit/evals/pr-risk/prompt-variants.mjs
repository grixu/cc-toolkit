import { V2_TYPES } from './v2-types.mjs'

export const CAUSAL_IMPACT_INSTRUCTIONS = 'If the change in `diff` contains a mistake, what is the worst consequence once it is deployed? Base the consequence on a path from the changed behavior supported by the diff or provided execution context; a security or data domain alone does not establish that path, and stated intent does not establish implementation.'

export const SEMANTIC_LIKELIHOOD_INSTRUCTIONS = 'How likely is the change in `diff` to contain a mistake? Apply the likelihood criteria to the distinct assumptions needed for the changed behavior to be correct and how those assumptions interact, using the diff or provided execution context. Count repeated applications of the same rule once. Distinguish assumptions about an external contract from interactions that depend on order, timing or state; ground these dependencies in the changed behavior rather than edit length or domain terminology.'

const VARIANTS = ['dominance', 'presence', 'v2', 'causal-impact-v1', 'semantic-likelihood-v1']

export function validateVariant(variant) {
  if (!VARIANTS.includes(variant)) throw new Error(`--variant must be one of: ${VARIANTS.join(', ')}`)
}

// Only diff requests are rewritten; intent and policy requests retain their original bytes.
export function rewritePrompt(body, { variant, characters, diffContext = false, context } = {}) {
  validateVariant(variant)
  const req = JSON.parse(body)
  if (!('diff' in req.state)) return body
  if (variant === 'v2')
    req.questions = Object.fromEntries([
      ...Object.entries(req.questions).filter(([key]) => key.startsWith('defect_')),
      ...Object.entries(V2_TYPES).map(([key, q]) => [key, { type: 'noul', ...q }]),
    ])
  if (variant === 'presence')
    for (const [key, c] of Object.entries(characters)) req.questions[key] = { type: 'noul', instructions: `\`diff\` adds or changes ${c.subject}.` }
  if (variant === 'causal-impact-v1') {
    if (!req.questions.defect_impact) throw new Error('diff request lacks defect_impact question')
    req.questions.defect_impact.instructions = CAUSAL_IMPACT_INSTRUCTIONS
  }
  if (variant === 'semantic-likelihood-v1') {
    if (!req.questions.defect_likelihood) throw new Error('diff request lacks defect_likelihood question')
    req.questions.defect_likelihood.instructions = SEMANTIC_LIKELIHOOD_INSTRUCTIONS
  }
  if (diffContext && context) req.state = { context, ...req.state }
  return JSON.stringify(req)
}
