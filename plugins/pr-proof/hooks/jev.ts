// Jev client helpers copied from dev-kit's hooks at e20a572: a plugin cannot import another plugin's files, and a
// symlink breaks under --plugin-dir and local-path marketplaces. A fix to the originals has to be copied here by hand.

export const STATE_CHAR_BUDGET = 72_000 // the whole state: diff + commits + diffstat
export const COMMITS_CHAR_BUDGET = 8_000
export const DIFFSTAT_CHAR_BUDGET = 4_000
export const MAX_PARTS = 8 // dev-kit uses 32; the confirmed cost figure assumes 8
export const CONCURRENCY = 4
export const MAX_ATTEMPTS = 3
export const MAX_SPLIT_DEPTH = 3

const CUT_HUNK = '\n[… hunk cut to fit the request]'
const MAX_RETRY_DELAY_MS = 10_000

const EXCLUDED_FILE = [
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|bun\.lockb?|composer\.lock|Gemfile\.lock|Cargo\.lock|poetry\.lock|uv\.lock|Pipfile\.lock|go\.sum|flake\.lock)$/,
  /\.min\.(js|css)$/,
  /\.map$/,
  /(^|\/)(dist|build|vendor|node_modules)\//,
  /\.snap$/,
]

export const PROSE_FILE = /(^|\/)\.changeset\/|\.(md|mdx|markdown|txt|rst|adoc|mmd|mermaid|puml)$/i
export const AGENT_FILE = /(^|\/)(CLAUDE|AGENTS|SKILL)\.md$|(^|\/)\.(claude|cursor|github\/prompts)\/|(^|\/)(commands|agents|skills|rules)\/[^/]+\.mdx?$/i

export type FileDiff = { path: string; text: string }

export type Part = { files: string[]; diff: string }

export type Split = {
  parts: Part[]
  skippedFiles: string[]
  truncatedHunks: number
}

export type JevRequest = { url: string; model: string; key: string; questions: Record<string, unknown>; limit: Limit }
export type Limit = <T>(fn: () => Promise<T>) => Promise<T>

export function isExcluded(path: string): boolean {
  return EXCLUDED_FILE.some((re) => re.test(path))
}

export function trimmedOption(value: unknown, fallback: string): string {
  return (typeof value === 'string' && value.trim()) || fallback
}

export function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + '\n[… cut to fit the request]'
}

// A file's diff split at its hunks, each piece keeping the file header so it reads on its own.
function hunks(file: FileDiff, budget: number): { pieces: string[]; truncated: number } {
  const lines = file.text.split('\n')
  const first = lines.findIndex((l) => l.startsWith('@@'))
  if (first < 0) return { pieces: [file.text.slice(0, budget)], truncated: file.text.length > budget ? 1 : 0 }
  const head = lines.slice(0, first).join('\n') + '\n'
  const blocks: string[] = []
  for (const line of lines.slice(first)) {
    if (line.startsWith('@@') || !blocks.length) blocks.push(line)
    else blocks[blocks.length - 1] += '\n' + line
  }
  const room = budget - head.length
  const pieces: string[] = []
  let truncated = 0
  let current = ''
  for (let block of blocks) {
    if (block.length > room) {
      truncated += 1
      block = block.slice(0, room - CUT_HUNK.length) + CUT_HUNK
    }
    if (current && current.length + block.length + 1 > room) {
      pieces.push(head + current)
      current = ''
    }
    current += (current ? '\n' : '') + block
  }
  if (current) pieces.push(head + current)
  return { pieces, truncated }
}

export function split(files: FileDiff[], budget: number, maxParts = MAX_PARTS): Split {
  const parts: Part[] = []
  const skippedFiles: string[] = []
  let truncatedHunks = 0
  let current: Part = { files: [], diff: '' }
  const flush = () => {
    if (current.diff) parts.push(current)
    current = { files: [], diff: '' }
  }
  const add = (path: string, text: string) => {
    if (current.diff && current.diff.length + text.length + 1 > budget) flush()
    if (parts.length >= maxParts) return false
    if (!current.files.includes(path)) current.files.push(path)
    current.diff += (current.diff ? '\n' : '') + text
    return true
  }
  for (const file of files) {
    if (parts.length >= maxParts) {
      skippedFiles.push(file.path)
      continue
    }
    if (file.text.length <= budget) {
      if (!add(file.path, file.text)) skippedFiles.push(file.path)
      continue
    }
    const { pieces, truncated } = hunks(file, budget)
    truncatedHunks += truncated
    if (!pieces.every((piece) => add(file.path, piece))) skippedFiles.push(file.path)
  }
  flush()
  return { parts, skippedFiles, truncatedHunks }
}

// A request Jev refused as too long, split in two at file and hunk boundaries. Code tokenizes at 2.7 to 3.8 chars
// a token depending on the language, so a char budget cannot guarantee the token limit on its own.
export function halve(part: Part): { parts: Part[]; truncatedHunks: number } {
  const files = part.diff.split(/\n(?=diff --git a\/)/).map((text) => ({ path: diffPath(text) ?? part.files[0] ?? '', text }))
  const s = split(files, Math.ceil(part.diff.length / 2), Infinity)
  return { parts: s.parts, truncatedHunks: s.truncatedHunks }
}

// `diff --git a/<path> b/<path>` with renames off: both paths are the same, so the first half of the rest is it.
function diffPath(text: string): string | undefined {
  const head = text.split('\n', 1)[0]
  if (!head.startsWith('diff --git a/')) return undefined
  const rest = head.slice('diff --git '.length)
  return rest.slice(2, 2 + (rest.length - 5) / 2)
}

export async function pool<T, R>(items: T[], size: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
  return results
}

export const RETRYABLE = new Set([429, 500, 502, 503, 504, 529])

export function retryDelay(headers: Record<string, string> | undefined, attempt: number): number {
  const after = Number(headers?.['retry-after'])
  const ms = Number.isFinite(after) && after > 0 ? after * 1000 : 1000 * 2 ** (attempt - 1)
  return Math.min(ms, MAX_RETRY_DELAY_MS)
}

// Refs come from the model, so reject anything git could read as an option or a revision expression.
export function isSafeRef(ref: unknown): ref is string {
  return typeof ref === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref) && !ref.includes('..')
}

export function endpointUrl(endpoint: unknown): string {
  const base = trimmedOption(endpoint, 'https://api.typesafe.ai').replace(/\/+$/, '')
  return base.endsWith('/v1/systemone') ? base : base + '/v1/systemone'
}

export function httpError(status: number, body: string): string {
  if (status === 401 || status === 403)
    return `TypeSafe rejected the API key (HTTP ${status}). Check the key; an endpoint that redirects to another host also drops the Authorization header.`
  if (status === 400 && body.includes('max_tokens_exceeded'))
    return 'A request was longer than the Jev model accepts (HTTP 400 max_tokens_exceeded).'
  if (status === 422) return `TypeSafe refused the request (HTTP 422): ${body.slice(0, 500)}`
  if (status === 429) return 'TypeSafe rate limit reached (HTTP 429). Try again later.'
  return `TypeSafe answered HTTP ${status}: ${body.slice(0, 300)}`
}

// Every pool shares one cap, so nested pools still hold Jev to CONCURRENCY requests in flight.
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

export async function post($, request: JevRequest, body: string) {
  const res = await send($, request, body)
  if (!res.ok) throw new Error(httpError(res.status, res.text))
  return res
}

export async function send($, request: JevRequest, body: string) {
  for (let attempt = 1; ; attempt++) {
    const res = await request.limit(() => $.http.fetch(request.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${request.key}`, 'content-type': 'application/json' },
      body,
    }))
    if (res.ok || !RETRYABLE.has(res.status) || attempt === MAX_ATTEMPTS) return res
    // $.clock.sleep counts toward the hook's 10 s budget, while time inside a process does not; the retry follows
    // whatever the exit code.
    await $.process.run(['sleep', String(retryDelay(res.headers, attempt) / 1000)], { timeoutMs: 30_000 })
  }
}

export const tooLong = (res) => res.status === 400 && String(res.text).includes('max_tokens_exceeded')

export async function git($, args: string[]): Promise<string> {
  const r = await $.process.run(['git', ...args], { timeoutMs: 60_000 })
  if (r.exitCode !== 0) throw new Error(`git ${args[0]} failed: ${r.stderr.trim().slice(0, 300)}`)
  return r.stdout
}

export async function resolveBase($, base: string): Promise<string> {
  // origin first: the PR merges into the remote branch, and a stale local copy would widen the range.
  for (const ref of [`origin/${base}`, base]) {
    const r = await $.process.run(['git', 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
    if (r.exitCode === 0) return ref
  }
  throw new Error(`base branch "${base}" not found locally or on origin; run git fetch origin`)
}

export async function readDiffs($, range: string, paths: string[], budget: number): Promise<{ files: FileDiff[]; unread: string[] }> {
  const files: FileDiff[] = []
  const unread: string[] = []
  let charsRead = 0
  // Stop reading once the diff cannot fit in MAX_PARTS requests; the rest is reported as not assessed.
  for (const path of paths) {
    if (charsRead > budget * MAX_PARTS) {
      unread.push(path)
      continue
    }
    // The paths are relative to the repository root, and the session may sit in a subdirectory.
    const diff = await git($, ['diff', '--no-relative', '-U1', '--no-color', '--no-ext-diff', '--no-renames', range, '--', `:(top,literal)${path}`])
    const text = diff.trimEnd()
    charsRead += text.length
    files.push({ path, text })
  }
  return { files, unread }
}
