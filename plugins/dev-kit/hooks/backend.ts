// The decision backends: TypeSafe Jev and Gemini Decision. This file is identical in dev-kit/hooks and
// pr-proof/hooks, since a plugin cannot import another plugin's files; change both copies together.
// Request bodies are built in Jev's shape everywhere and translated here, so the TypeSafe path stays byte for byte.

export type BackendName = 'typesafe' | 'gemini'
export type Backend = { name: BackendName; url: string; model: string; key: string }
export type Keys = Record<BackendName, string>

export const BACKENDS: BackendName[] = ['typesafe', 'gemini']
export const MODES = ['auto', 'typesafe', 'gemini', 'both'] as const
export const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/decisions'
export const GEMINI_MODEL = 'gemini-decision-1'
export const CHOICE_NEEDED = 'Backend choice needed:'

const LABEL: Record<BackendName, string> = { typesafe: 'TypeSafe', gemini: 'Gemini' }

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

export async function backendKeys($, options): Promise<Keys> {
  return {
    typesafe: text(options?.typesafe_api_key) || text(await $.env.get('TYPESAFE_API_KEY')),
    gemini:
      text(options?.gemini_api_key) ||
      text(await $.env.get('GEMINI_DECISIONS_API_KEY')) ||
      text(await $.env.get('GEMINI_API_KEY')),
  }
}

export function hasAnyKey(keys: Keys): boolean {
  return BACKENDS.some((name) => keys[name])
}

export function missingKey(name: BackendName, plugin: string): string {
  return name === 'typesafe'
    ? `no TypeSafe API key; set TYPESAFE_API_KEY or the ${plugin} option typesafe_api_key`
    : `no Gemini API key; set GEMINI_DECISIONS_API_KEY, GEMINI_API_KEY or the ${plugin} option gemini_api_key`
}

// `requested` is the user's answer relayed by the skill, so it wins over the configured mode. With mode auto and both
// keys set the user has not chosen yet, which the caller turns into a CHOICE_NEEDED result.
export function chooseBackends(options, requested: unknown, keys: Keys, plugin: string): BackendName[] | 'choose' {
  if (requested !== undefined && !(MODES as readonly unknown[]).includes(requested))
    throw new Error('`backend` must be auto, typesafe, gemini or both')
  const configured = text(options?.decision_backend)
  const mode = (requested ?? ((MODES as readonly string[]).includes(configured) ? configured : 'auto')) as (typeof MODES)[number]
  if (mode === 'auto') {
    const available = BACKENDS.filter((name) => keys[name])
    if (available.length === 2) return 'choose'
    if (!available.length) throw new Error(missingKey('typesafe', plugin))
    return available
  }
  const names: BackendName[] = mode === 'both' ? [...BACKENDS] : [mode]
  const missing = names.find((name) => !keys[name])
  if (missing) throw new Error(missingKey(missing, plugin))
  const primary = primaryBackend(options)
  return names.includes(primary) ? [primary, ...names.filter((n) => n !== primary)] : names
}

export function primaryBackend(options): BackendName {
  return text(options?.primary_backend) === 'gemini' ? 'gemini' : 'typesafe'
}

export function choiceNeeded(tool: string): string {
  return `${CHOICE_NEEDED} both a TypeSafe and a Gemini key are set and decision_backend is auto. Ask the user whether to use typesafe, gemini or both, then call ${tool} again with \`backend\` set to the answer.`
}

export function backendFor(name: BackendName, key: string, typesafe: { url: string; model: string }): Backend {
  return name === 'gemini' ? { name, url: GEMINI_URL, model: GEMINI_MODEL, key } : { name, ...typesafe, key }
}

export function requestInit(backend: Backend, body: string) {
  if (backend.name === 'typesafe')
    return { method: 'POST', headers: { authorization: `Bearer ${backend.key}`, 'content-type': 'application/json' }, body }
  return { method: 'POST', headers: { 'x-goog-api-key': backend.key, 'content-type': 'application/json' }, body: toGemini(body) }
}

// Gemini takes text input, so the state travels as JSON text whose keys the questions already name in backticks.
export function toGemini(body: string): string {
  const { state, questions } = JSON.parse(body)
  return JSON.stringify({
    model: GEMINI_MODEL,
    input: JSON.stringify(state),
    questions: Object.fromEntries(Object.entries(questions ?? {}).map(([key, q]) => [key, geminiQuestion(q)])),
  })
}

function geminiQuestion(q) {
  if (q?.type === 'noul' && q.criteria && 'true' in q.criteria)
    return { ...q, criteria: { true_description: q.criteria.true, false_description: q.criteria.false } }
  if (q?.type === 'score' && Array.isArray(q.criteria))
    return { ...q, criteria: q.criteria.map((c) => (typeof c === 'string' ? c : `${c.what} This level is not for: ${c.not_for}`)) }
  return q
}

// Gemini's answers carry no model name, while every caller reports the model that answered.
export function readResponse(backend: Backend, res: { ok: boolean; text: string }) {
  if (!res.ok || backend.name === 'typesafe') return res
  return { ...res, text: JSON.stringify({ model: backend.model, ...JSON.parse(res.text) }) }
}

export function tooLong(backend: Backend, res: { status: number; text: unknown }): boolean {
  if (res.status !== 400) return false
  return backend.name === 'gemini'
    ? String(res.text).includes('exceeds the maximum number of tokens')
    : String(res.text).includes('max_tokens_exceeded')
}

export function httpError(backend: Backend, status: number, body: string): string {
  if (backend.name === 'gemini') {
    if (status === 401 || status === 403) return `Gemini rejected the API key (HTTP ${status}). The Decisions API needs a Gemini Developer API key with access to gemini-decision-1.`
    if (status === 400 && /"code":\s*"(safety|prohibited_content|blocklist|image_safety|content_blocked)"/.test(body))
      return `Gemini blocked the request with its safety filters (HTTP 400): ${body.slice(0, 300)}`
    if (status === 429) return 'Gemini rate limit reached (HTTP 429). Try again later.'
    return `Gemini answered HTTP ${status}: ${body.slice(0, 300)}`
  }
  if (status === 401 || status === 403)
    return `TypeSafe rejected the API key (HTTP ${status}). Check the key; an endpoint that redirects to another host also drops the Authorization header.`
  if (status === 400 && body.includes('max_tokens_exceeded'))
    return 'A request was longer than the Jev model accepts (HTTP 400 max_tokens_exceeded).'
  if (status === 422) return `TypeSafe refused the request (HTTP 422): ${body.slice(0, 500)}`
  if (status === 429) return 'TypeSafe rate limit reached (HTTP 429). Try again later.'
  return `TypeSafe answered HTTP ${status}: ${body.slice(0, 300)}`
}

export function label(name: BackendName): string {
  return LABEL[name]
}

// Appends one JSON line through sh with the path and line as arguments, so neither is parsed as shell code.
export async function appendLine($, path: string, line: string): Promise<void> {
  await $.process.run(['sh', '-c', 'mkdir -p "$(dirname "$1")" && printf "%s\\n" "$2" >> "$1"', 'sh', path, line], { timeoutMs: 10_000 })
}
