// The internal decision format and the client every consumer asks through. This file and providers/ are identical in
// dev-kit/hooks and pr-proof/hooks, since a plugin cannot import another plugin's files; change both copies together.

export type ProviderName = 'typesafe' | 'gemini'

export type Level = string | { description: string; notFor: string }
export type Question =
  | { type: 'binary'; instructions: string; criteria?: { yes: string; no: string } }
  | { type: 'scale'; instructions: string; levels: Level[] }
  | { type: 'choice'; instructions: string; options: Record<string, string> }
export type Questions = Record<string, Question>
export type DecisionRequest = { input: Record<string, unknown>; questions: Questions }

export type BinaryAnswer = { type: 'binary'; p: number; confidence?: number }
// `probabilities[i]` belongs to `levels[i]`; `expected` is their probability-weighted mean.
export type ScaleAnswer = { type: 'scale'; expected: number; probabilities?: number[]; confidence?: number }
export type ChoiceAnswer = { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence?: number }
export type Answer = BinaryAnswer | ScaleAnswer | ChoiceAnswer
export type Answers = Record<string, Answer>
export type DecisionResponse = { provider: ProviderName; model: string; answers: Answers }

export type FailureKind = 'too_long' | 'retryable' | 'rate_limit' | 'auth' | 'blocked' | 'other'
export type Failure = { kind: FailureKind; message: string }
export type WireRequest = { url: string; init: { method: 'POST'; headers: Record<string, string>; body: string } }

export interface DecisionProvider {
  name: ProviderName
  label: string
  model: string
  encode(request: DecisionRequest): WireRequest
  // Separate from decode so evals can read answers recorded in a provider's wire shape.
  decodeAnswers(request: DecisionRequest, wire: unknown): Answers
  decode(request: DecisionRequest, res: { text: string }): DecisionResponse
  failure(res: { status: number; text: string }): Failure
}

export class DecisionError extends Error {
  kind: FailureKind
  constructor(kind: FailureKind, message: string) {
    super(message)
    this.kind = kind
  }
}

export type Limit = <T>(fn: () => Promise<T>) => Promise<T>

export const MAX_ATTEMPTS = 3
const MAX_RETRY_DELAY_MS = 10_000

export async function ask($, provider: DecisionProvider, request: DecisionRequest, limit: Limit): Promise<DecisionResponse> {
  const { url, init } = provider.encode(request)
  for (let attempt = 1; ; attempt++) {
    const res = await limit(() => $.http.fetch(url, init))
    if (res.ok) return provider.decode(request, res)
    const failure = provider.failure(res)
    if ((failure.kind !== 'retryable' && failure.kind !== 'rate_limit') || attempt === MAX_ATTEMPTS)
      throw new DecisionError(failure.kind, failure.message)
    // $.clock.sleep counts toward the hook's 10 s budget, while time inside a process does not; the retry follows
    // whatever the exit code.
    await $.process.run(['sleep', String(retryDelay(res.headers, attempt) / 1000)], { timeoutMs: 30_000 })
  }
}

export function retryDelay(headers: Record<string, string> | undefined, attempt: number): number {
  const after = Number(headers?.['retry-after'])
  const ms = Number.isFinite(after) && after > 0 ? after * 1000 : 1000 * 2 ** (attempt - 1)
  return Math.min(ms, MAX_RETRY_DELAY_MS)
}

// Nested pools run side by side, so only a cap shared by every request holds a provider to `size` in flight.
export function limiter(size: number): Limit {
  let active = 0
  const waiting: (() => void)[] = []
  return async (fn) => {
    if (active >= size) await new Promise<void>((resolve) => waiting.push(resolve))
    else active++
    try {
      return await fn()
    } finally {
      const next = waiting.shift()
      if (next) next()
      else active--
    }
  }
}

// Reads answers whose wire fields are named `noul`, `score`, `choice` and `probabilities`, as both TypeSafe and Gemini
// name them. An answer without a usable value is left out, so the caller's check for missing answers catches it.
export function readWireAnswers(request: DecisionRequest, wire: unknown): Answers {
  const answers: Answers = {}
  const raw = (wire && typeof wire === 'object' ? wire : {}) as Record<string, any>
  for (const [key, question] of Object.entries(request.questions)) {
    const a = raw[key]
    if (!a || typeof a !== 'object') continue
    const confidence = Number.isFinite(a.confidence) ? { confidence: a.confidence as number } : {}
    if (question.type === 'binary' && Number.isFinite(a.noul)) answers[key] = { type: 'binary', p: a.noul, ...confidence }
    if (question.type === 'scale') {
      const wire = a.probabilities && typeof a.probabilities === 'object' ? a.probabilities : undefined
      const probabilities = wire && question.levels.map((_, i) => Number(wire[String(i)]) || 0)
      const expected = Number.isFinite(a.score) ? a.score : probabilities?.reduce((s, p, i) => s + p * i, 0)
      if (expected !== undefined) answers[key] = { type: 'scale', expected, ...(probabilities ? { probabilities } : {}), ...confidence }
    }
    if (question.type === 'choice' && typeof a.choice === 'string')
      answers[key] = { type: 'choice', choice: a.choice, probabilities: { ...(a.probabilities ?? {}) }, ...confidence }
  }
  return answers
}
