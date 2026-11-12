// Diff helpers copied from dev-kit's hooks at e20a572: a plugin cannot import another plugin's files, and a symlink
// breaks under --plugin-dir and local-path marketplaces. A fix to the originals has to be copied here by hand.

export const STATE_CHAR_BUDGET = 72_000 // the whole state: diff + commits + diffstat
export const COMMITS_CHAR_BUDGET = 8_000
export const DIFFSTAT_CHAR_BUDGET = 4_000
export const MAX_PARTS = 8 // the confirmed cost figure assumes 8
export const CONCURRENCY = 4
export const MAX_SPLIT_DEPTH = 3

const CUT_HUNK = '\n[… hunk cut to fit the request]'

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

export function isExcluded(path: string): boolean {
  return EXCLUDED_FILE.some((re) => re.test(path))
}

export function trimmedOption(value: unknown, fallback: string): string {
  return (typeof value === 'string' && value.trim()) || fallback
}

export function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + '\n[… cut to fit the request]'
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

// A request Jev refused as too long, re-split at half its size along file and hunk boundaries. Code tokenizes at
// 2.7 to 3.8 chars a token depending on the language, so a char budget cannot guarantee the token limit on its own.
export function halve(part: Part): { parts: Part[]; truncatedHunks: number } {
  const s = split(fileDiffs(part.diff, part.files[0] ?? ''), Math.ceil(part.diff.length / 2), Infinity)
  return { parts: s.parts, truncatedHunks: s.truncatedHunks }
}

export function fileDiffs(diff: string, fallbackPath = ''): FileDiff[] {
  return diff.split(/\n(?=diff --git "?a\/)/).map((text) => ({ path: diffPath(text) ?? fallbackPath, text }))
}

// `diff --git a/<path> b/<path>` with renames off: both paths are the same, so the first half of the rest is it.
// core.quotePath=false still leaves a path with `"`, `\` or a control character C-quoted on both sides.
export function diffPath(text: string): string | undefined {
  const head = text.split('\n', 1)[0]
  const rest = head.slice('diff --git '.length)
  if (head.startsWith('diff --git a/')) return rest.slice(2, 2 + (rest.length - 5) / 2)
  if (head.startsWith('diff --git "a/')) return unquoteC(rest.slice(0, (rest.length - 1) / 2)).slice(2)
  return undefined
}

const C_ESCAPES: Record<string, string> = { a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' }

// Octal escapes are UTF-8 bytes, so the path is rebuilt as percent-encoded bytes and decoded once.
function unquoteC(quoted: string): string {
  const encoded = quoted.slice(1, -1).replace(/\\([0-7]{3}|.)|[^\\]+/g, (match: string, escape?: string) => {
    if (escape === undefined) return encodeURIComponent(match)
    if (/^[0-7]{3}$/.test(escape)) return '%' + parseInt(escape, 8).toString(16).padStart(2, '0')
    return encodeURIComponent(C_ESCAPES[escape] ?? escape)
  })
  return decodeURIComponent(encoded)
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

// Refs come from the model, so reject anything git could read as an option or a revision expression.
export function isSafeRef(ref: unknown): ref is string {
  return typeof ref === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref) && !ref.includes('..')
}

// The session's working directory follows the model's `cd`, which can leave the repository for a scratchpad or a
// work dir, so fall back to the directory the session started in.
export async function repoRoot($): Promise<string> {
  const here = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { timeoutMs: 60_000 })
  if (here.exitCode === 0) return here.stdout.trim()
  const root = await $.session.root()
  const started = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd: root, timeoutMs: 60_000 })
  if (started.exitCode === 0) return started.stdout.trim()
  throw new Error(`neither the session's working directory (${await $.session.cwd()}) nor the directory it started in (${root}) is in a git repository`)
}

export async function git($, cwd: string, args: string[]): Promise<string> {
  const r = await $.process.run(['git', ...args], { cwd, timeoutMs: 60_000 })
  const subcommand = args[args[0] === '-c' ? 2 : 0]
  if (r.exitCode !== 0) throw new Error(`git ${subcommand} failed: ${r.stderr.trim().slice(0, 300)}`)
  return r.stdout
}

export async function resolveBase($, cwd: string, base: string): Promise<string> {
  // origin first: the PR merges into the remote branch, and a stale local copy would widen the range.
  for (const ref of [`origin/${base}`, base]) {
    const r = await $.process.run(['git', 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd })
    if (r.exitCode === 0) return ref
  }
  throw new Error(`base branch "${base}" not found locally or on origin; run git fetch origin`)
}

export async function readDiffs($, cwd: string, range: string, paths: string[], budget: number): Promise<{ files: FileDiff[]; unread: string[] }> {
  const files: FileDiff[] = []
  const unread: string[] = []
  let charsRead = 0
  // Stop reading once the diff cannot fit in MAX_PARTS requests; the rest is reported as not assessed.
  for (const path of paths) {
    if (charsRead > budget * MAX_PARTS) {
      unread.push(path)
      continue
    }
    // A quoted header would hide a non-ASCII path from diffPath and glue its file to the one before it.
    const diff = await git($, cwd, ['-c', 'core.quotePath=false', 'diff','--no-relative', '-U1', '--no-color', '--no-ext-diff', '--no-renames', range, '--', `:(top,literal)${path}`])
    const text = diff.trimEnd()
    charsRead += text.length
    files.push({ path, text })
  }
  return { files, unread }
}
