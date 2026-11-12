import { readWireAnswers, type DecisionProvider, type DecisionRequest, type Failure, type Question } from '../decision.ts'

export const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/decisions'
export const GEMINI_MODEL = 'gemini-decision-1'

// Gemini takes text input, so the input travels as JSON text whose keys the questions already name in backticks.
export function geminiBody(request: DecisionRequest): string {
  const questions = Object.fromEntries(Object.entries(request.questions).map(([key, q]) => [key, wireQuestion(q)]))
  return JSON.stringify({ model: GEMINI_MODEL, input: JSON.stringify(request.input), questions })
}

// A score level is plain text here, so what a level is not for joins its description.
function wireQuestion(q: Question) {
  if (q.type === 'binary')
    return {
      type: 'noul',
      instructions: q.instructions,
      ...(q.criteria ? { criteria: { true_description: q.criteria.yes, false_description: q.criteria.no } } : {}),
    }
  if (q.type === 'scale')
    return {
      type: 'score',
      instructions: q.instructions,
      criteria: q.levels.map((l) => (typeof l === 'string' ? l : `${l.description} This level is not for: ${l.notFor}`)),
    }
  return { type: 'choice', instructions: q.instructions, criteria: q.options }
}

const SAFETY_CODE = /"code":\s*"(safety|prohibited_content|blocklist|image_safety|content_blocked)"/

export function geminiFailure(res: { status: number; text: string }): Failure {
  const { status } = res
  const body = String(res.text ?? '')
  if (status === 401 || status === 403)
    return { kind: 'auth', message: `Gemini rejected the API key (HTTP ${status}). The Decisions API needs a Gemini Developer API key with access to gemini-decision-1.` }
  if (status === 400 && SAFETY_CODE.test(body))
    return { kind: 'blocked', message: `Gemini blocked the request with its safety filters (HTTP 400): ${body.slice(0, 300)}` }
  if (status === 400 && body.includes('exceeds the maximum number of tokens'))
    return { kind: 'too_long', message: `Gemini answered HTTP 400: ${body.slice(0, 300)}` }
  if (status === 429) return { kind: 'rate_limit', message: 'Gemini rate limit reached (HTTP 429). Try again later.' }
  return { kind: [500, 502, 503, 504, 529].includes(status) ? 'retryable' : 'other', message: `Gemini answered HTTP ${status}: ${body.slice(0, 300)}` }
}

export function gemini(key: string): DecisionProvider {
  return {
    name: 'gemini',
    label: 'Gemini',
    model: GEMINI_MODEL,
    encode: (request) => ({
      url: GEMINI_URL,
      init: { method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, body: geminiBody(request) },
    }),
    decodeAnswers: readWireAnswers,
    // Gemini's answers carry no model name, while every caller reports the model that answered.
    decode: (request, res) => ({ provider: 'gemini', model: GEMINI_MODEL, answers: readWireAnswers(request, JSON.parse(res.text).answers) }),
    failure: geminiFailure,
  }
}
