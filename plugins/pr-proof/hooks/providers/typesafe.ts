import { readWireAnswers, type DecisionProvider, type DecisionRequest, type Failure, type Question } from '../decision.ts'

export const TYPESAFE_MODEL = 'jev-1.14.0'
const DEFAULT_ENDPOINT = 'https://api.typesafe.ai'
const SYSTEMONE_PATH = '/v1/systemone'

export function typesafeEndpoint(endpoint: unknown): string {
  const base = ((typeof endpoint === 'string' && endpoint.trim()) || DEFAULT_ENDPOINT).replace(/\/+$/, '')
  return base.endsWith(SYSTEMONE_PATH) ? base : base + SYSTEMONE_PATH
}

// Key order matters: the evals hash request bodies against the ones Jev's recorded answers were given for.
export function typesafeBody(model: string, request: DecisionRequest): string {
  const questions = Object.fromEntries(Object.entries(request.questions).map(([key, q]) => [key, wireQuestion(q)]))
  return JSON.stringify({ model, state: request.input, questions })
}

function wireQuestion(q: Question) {
  if (q.type === 'binary')
    return { type: 'noul', instructions: q.instructions, ...(q.criteria ? { criteria: { true: q.criteria.yes, false: q.criteria.no } } : {}) }
  if (q.type === 'scale')
    return {
      type: 'score',
      instructions: q.instructions,
      criteria: q.levels.map((l) => (typeof l === 'string' ? l : { what: l.description, not_for: l.notFor })),
    }
  return { type: 'choice', instructions: q.instructions, criteria: q.options }
}

export function typesafeFailure(res: { status: number; text: string }): Failure {
  const { status } = res
  const body = String(res.text ?? '')
  if (status === 401 || status === 403)
    return { kind: 'auth', message: `TypeSafe rejected the API key (HTTP ${status}). Check the key; an endpoint that redirects to another host also drops the Authorization header.` }
  if (status === 400 && body.includes('max_tokens_exceeded'))
    return { kind: 'too_long', message: 'A request was longer than the Jev model accepts (HTTP 400 max_tokens_exceeded).' }
  if (status === 422) return { kind: 'other', message: `TypeSafe refused the request (HTTP 422): ${body.slice(0, 500)}` }
  if (status === 429) return { kind: 'rate_limit', message: 'TypeSafe rate limit reached (HTTP 429). Try again later.' }
  return { kind: [500, 502, 503, 504, 529].includes(status) ? 'retryable' : 'other', message: `TypeSafe answered HTTP ${status}: ${body.slice(0, 300)}` }
}

export function typesafe(key: string, options?: { endpoint?: unknown; model?: unknown }): DecisionProvider {
  const model = (typeof options?.model === 'string' && options.model.trim()) || TYPESAFE_MODEL
  const url = typesafeEndpoint(options?.endpoint)
  return {
    name: 'typesafe',
    label: 'TypeSafe',
    model,
    encode: (request) => ({
      url,
      init: { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: typesafeBody(model, request) },
    }),
    decodeAnswers: readWireAnswers,
    decode(request, res) {
      const data = JSON.parse(res.text)
      return { provider: 'typesafe', model: typeof data.model === 'string' ? data.model : model, answers: readWireAnswers(request, data.answers) }
    },
    failure: typesafeFailure,
  }
}
