// Pure helpers for the pr_risk tool: no mods API calls, so they can be imported and unit tested.

export const DEFAULT_LEVELS = ['low', 'medium', 'high', 'critical']

// Jev's default limit is 32k tokens per question; code tokenizes densely, so budget ~3 chars a token.
export const STATE_CHAR_BUDGET = 72_000
export const HEADER_CHAR_BUDGET = 12_000
export const MAX_PARTS = 8

const EXCLUDED_FILE = [
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|bun\.lockb?|composer\.lock|Gemfile\.lock|Cargo\.lock|poetry\.lock|uv\.lock|Pipfile\.lock|go\.sum|flake\.lock)$/,
  /\.min\.(js|css)$/,
  /\.map$/,
  /(^|\/)(dist|build|vendor|node_modules)\//,
  /\.snap$/,
]

// Anchors from no runtime impact to hard-to-reverse harm; levels between them borrow the nearest one.
const RUBRIC = [
  'Documentation, comments, formatting or test-only changes; no runtime behavior changes',
  'A small, localized behavior change in one area with an obvious blast radius',
  'Changes the behavior of shared code, several modules or a dependency',
  'Changes a critical path such as authentication, payments, data persistence or a public interface, where a defect would reach many users',
  'A defect would likely cause an outage, data loss or a security exposure that is hard to reverse',
]

export const SIGNALS: Record<string, { label: string; instructions: string }> = {
  security: {
    label: 'Touches security',
    instructions:
      'The diff changes authentication, authorization, permissions, secret handling, cryptography or the validation of untrusted input.',
  },
  data: {
    label: 'Changes persisted data',
    instructions: 'The diff changes a database schema, a migration, or the format of persisted or serialized data.',
  },
  contract: {
    label: 'Changes a public contract',
    instructions:
      'The diff changes a contract other code or users depend on: an API endpoint, an exported function or type, a CLI flag, a configuration key or an event payload.',
  },
  infra: {
    label: 'Changes CI, build or deployment',
    instructions: 'The diff changes CI pipelines, deployment, infrastructure or build configuration.',
  },
  irreversible: {
    label: 'Hard to reverse',
    instructions:
      'The diff adds an operation that is hard to undo once it runs, such as deleting or rewriting data, a destructive migration, or sending messages or payments.',
  },
  untested: {
    label: 'Logic without tests',
    instructions:
      'The diff changes runtime logic, and no file in the diffstat, which lists every file of the whole change, adds or updates tests for it.',
  },
}

export type FileDiff = { path: string; text: string }

export type Part = { files: string[]; diff: string }

export type Split = {
  parts: Part[]
  skippedFiles: string[]
  truncatedHunks: number
}

export type JevAnswer = {
  score?: number
  confidence?: number
  noul?: number
}

export type PartResult = { model: string; answers: Record<string, JevAnswer> }

export type Config = {
  levels: string[]
  labelEnabled: boolean
  labelTemplate: string
}

export function isExcluded(path: string): boolean {
  return EXCLUDED_FILE.some((re) => re.test(path))
}

export function readLevels(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  const levels = list.map((v) => String(v).trim()).filter(Boolean)
  // Jev accepts 1–10 score criteria, and one level carries no information.
  return levels.length >= 2 && levels.length <= 10 ? levels : DEFAULT_LEVELS
}

export function readConfig(options: Record<string, unknown> | undefined): Config {
  const o = options ?? {}
  return {
    levels: readLevels(o.risk_levels),
    labelEnabled: o.risk_label !== false && o.risk_label !== 'false',
    labelTemplate: typeof o.risk_label_name === 'string' && o.risk_label_name.trim() ? o.risk_label_name.trim() : 'risk: {level}',
  }
}

export function labelFor(template: string, level: string): string {
  return template.includes('{level}') ? template.split('{level}').join(level) : `${template}: ${level}`
}

export function rubric(levels: string[]): string[] {
  const last = levels.length - 1
  return levels.map((name, i) => `${name}: ${RUBRIC[Math.round((i * (RUBRIC.length - 1)) / last)]}`)
}

export function questions(levels: string[]): Record<string, unknown> {
  const q: Record<string, unknown> = {
    overall_risk: {
      type: 'score',
      instructions:
        'How risky is merging this change: how likely and how severe is a defect or incident it introduces? `commits` and `diffstat` describe the whole change; `diff` holds the part named in `part`.',
      criteria: rubric(levels),
    },
  }
  for (const [key, s] of Object.entries(SIGNALS)) q[key] = { type: 'noul', instructions: s.instructions }
  return q
}

export function header(commits: string, diffstat: string): { commits: string; diffstat: string } {
  const half = HEADER_CHAR_BUDGET / 2
  return { commits: clip(commits, half), diffstat: clip(diffstat, half) }
}

function clip(text: string, max: number): string {
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
      block = block.slice(0, room - 40) + '\n[… hunk cut to fit the request]'
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
    let complete = true
    for (const piece of pieces) {
      if (!add(file.path, piece)) {
        complete = false
        break
      }
    }
    if (!complete) skippedFiles.push(file.path)
  }
  flush()
  return { parts, skippedFiles, truncatedHunks }
}

// The riskiest part decides the change's risk; a signal raised by any part counts for the whole.
export function aggregate(results: PartResult[], config: Config) {
  let best = results[0]
  for (const r of results) if ((r.answers.overall_risk?.score ?? 0) > (best.answers.overall_risk?.score ?? 0)) best = r
  const score = best.answers.overall_risk?.score ?? 0
  const index = Math.min(config.levels.length - 1, Math.max(0, Math.round(score)))
  const level = config.levels[index]
  const signals = Object.entries(SIGNALS).map(([key, s]) => ({
    key,
    label: s.label,
    probability: round(Math.max(...results.map((r) => r.answers[key]?.noul ?? 0))),
  }))
  return {
    level,
    levels: config.levels,
    score: round(score),
    confidence: round(best.answers.overall_risk?.confidence ?? 0),
    model: best.model,
    flags: signals.filter((s) => s.probability >= 0.5).sort((a, b) => b.probability - a.probability),
    signals,
    label: {
      enabled: config.labelEnabled,
      name: labelFor(config.labelTemplate, level),
      all: config.levels.map((l) => labelFor(config.labelTemplate, l)),
    },
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

// Refs come from the model, so reject anything git could read as an option or a revision expression.
export function isSafeRef(ref: unknown): ref is string {
  return typeof ref === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref) && !ref.includes('..')
}

export function endpointUrl(endpoint: unknown): string {
  const base = (typeof endpoint === 'string' && endpoint.trim() ? endpoint.trim() : 'https://api.typesafe.ai').replace(/\/+$/, '')
  return base.endsWith('/v1/systemone') ? base : base + '/v1/systemone'
}

export function httpError(status: number, body: string): string {
  if (status === 401 || status === 403)
    return `TypeSafe rejected the API key (HTTP ${status}). Check the key; an endpoint that redirects to another host also drops the Authorization header.`
  if (status === 422) return `TypeSafe refused the request (HTTP 422): ${body.slice(0, 500)}`
  if (status === 429) return 'TypeSafe rate limit reached (HTTP 429). Try again later.'
  return `TypeSafe answered HTTP ${status}: ${body.slice(0, 300)}`
}
