// Whether a review fix can be applied without asking its owner. A decision model (Jev, Gemini Decision) answers the
// questions below for one finding; walkDecision turns the answers into `apply` or `ask`. There is no automatic skip:
// in the recorded walks the owner declined or reshaped a fix about one time in nine, too few to set a skip threshold.
import type { Answers, DecisionRequest, Questions } from './decision.ts'

export type FixRisk = 'safe' | 'structural' | 'report-only'

export type Finding = {
  severity?: string | null
  family?: string | null
  rule?: string | null
  path?: string | null
  lines?: string | null
  risk?: FixRisk | null
  boyScout?: boolean
  // What the report says is wrong, without the remedy.
  problem?: string | null
  // The edit the review proposes, as the report states it; absent when the report names only the problem.
  fix?: string | null
  // The file around the finding's lines, with line numbers.
  excerpt?: string | null
  // The change's diff hunks that overlap the finding's lines.
  hunk?: string | null
}

export type ReviewContext = {
  scope?: string | null
  // Only conventions that bear on this finding; a "none apply" note is noise to the model.
  conventions?: string | null
  spec?: string | null
  // Every path the reviewed change touches, so the model can tell whether the fix stays inside the change.
  changedFiles?: string[] | null
}

// Per-field caps in characters; together they stay far below either model's input limit, and the code fields get
// the most room because they are what the questions are judged on.
export const FIELD_BUDGET = {
  finding: 400,
  problem: 1500,
  proposed_fix: 2500,
  code: 6000,
  diff_hunk: 6000,
  scope: 300,
  conventions: 1500,
  spec: 3000,
  changed_files: 4000,
} as const

const CUT = '\n… [cut]'

export function cut(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - CUT.length) + CUT
}

const filled = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''

function listWithin(paths: string[], max: number): string[] {
  const kept: string[] = []
  let used = 0
  for (const p of paths) {
    if (used + p.length + 3 > max) {
      kept.push(`… ${paths.length - kept.length} more`)
      break
    }
    kept.push(p)
    used += p.length + 3
  }
  return kept
}

// The same line shape cr-merge returns, so the model reads one finding the way the review reports it.
export function findingLine(f: Finding): string {
  const site = f.path ? `${f.path}${f.lines ? `:${f.lines.replace(/^(?!L)/, 'L')}` : ''}` : null
  return [f.severity, f.family, f.rule, site, f.risk, f.boyScout ? 'boy-scout' : null].filter(filled).join(' · ')
}

export function applyDecisionInput(finding: Finding, review: ReviewContext = {}): Record<string, unknown> {
  const fields: [keyof typeof FIELD_BUDGET, string | null | undefined][] = [
    ['finding', findingLine(finding)],
    ['problem', finding.problem],
    ['proposed_fix', finding.fix],
    ['code', finding.excerpt],
    ['diff_hunk', finding.hunk],
  ]
  const input: Record<string, unknown> = {}
  for (const [key, value] of fields) if (filled(value)) input[key] = cut(value.trim(), FIELD_BUDGET[key])
  const change: Record<string, unknown> = {}
  for (const key of ['scope', 'conventions', 'spec'] as const) {
    const value = review[key]
    if (filled(value)) change[key] = cut(value.trim(), FIELD_BUDGET[key])
  }
  if (review.changedFiles?.length) change.changed_files = listWithin(review.changedFiles, FIELD_BUDGET.changed_files)
  if (Object.keys(change).length) input.change = change
  return input
}

// Only the two questions that separated the owner's answers in the recorded walks. Asked whether the fix is valid,
// how far it reaches and what else it changes, both models answered about the same for applied and declined fixes.
export const APPLY_QUESTIONS: Questions = {
  needs_owner_facts: {
    type: 'binary',
    instructions: 'Does judging whether the fix is right need a fact that this input does not contain?',
    criteria: {
      yes: 'It depends on deployment or data state (whether a migration already ran, what a deployed service sends), on business, permission or product rules, on an outside system the code calls, or on intent the code does not show.',
      no: 'Whether the fix is right follows from the code, the problem and the change alone.',
    },
  },
  remedy_choice: {
    type: 'binary',
    instructions:
      'Is there more than one reasonable way to fix `problem`, such that the choice between them changes behaviour, an interface or a contract?',
    criteria: {
      yes: 'Another remedy is as defensible as the proposed one and would give callers, users or stored data different results: another status code or error, a narrower or broader edit, keeping instead of removing.',
      no: 'The proposed fix is the natural one; the alternatives differ only in naming or placement and give the same results.',
    },
  },
}

// The eval recovered each finding's code this way, so the tool must build it the same way for the measured
// thresholds to hold.
export const CONTEXT_LINES = 12

export function linesOf(spec: string | null | undefined): { from: number; to: number } | null {
  const nums = [...String(spec ?? '').matchAll(/(\d+)(?:\s*[-–]\s*(\d+))?/g)].flatMap((m) => [Number(m[1]), Number(m[2] ?? m[1])])
  return nums.length ? { from: Math.min(...nums), to: Math.max(...nums) } : null
}

export function excerptAround(text: string, range: { from: number; to: number } | null): string {
  const lines = text.split('\n')
  const from = range ? Math.max(1, range.from - CONTEXT_LINES) : 1
  const to = range ? Math.min(lines.length, range.to + CONTEXT_LINES) : Math.min(lines.length, 2 * CONTEXT_LINES)
  return lines.slice(from - 1, to).map((l, i) => `${from + i}\t${l}`).join('\n')
}

export function hunksAround(diff: string, range: { from: number; to: number } | null): string | null {
  if (!range) return null
  const picked = diff
    .split(/(?=^@@ )/m)
    .filter((h) => {
      const m = h.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
      if (!m) return false
      const start = Number(m[1])
      const end = start + Number(m[2] ?? 1)
      return start <= range.to + CONTEXT_LINES && end >= range.from - CONTEXT_LINES
    })
  return picked.join('').slice(0, FIELD_BUDGET.diff_hunk) || null
}

// A note that says no convention applies only distracts the model.
export const INERT_CONVENTIONS = /none that change|nothing there changes|changes? (?:a|the) verdict|nic z tego|no code conventions|covers only PR/i

export function applyDecisionRequest(finding: Finding, review: ReviewContext = {}): DecisionRequest {
  return { input: applyDecisionInput(finding, review), questions: APPLY_QUESTIONS }
}

export type Thresholds = {
  // The most p(needs_owner_facts) and p(remedy_choice) that still apply without asking.
  facts: number
  remedy: number
}

// Per backend, since Jev's probabilities sit higher than Gemini's (needs_owner_facts averages 0.42 there against 0.15
// on applied fixes). Each is the pick that applied no fix the owner declined across the 209 recorded walk decisions;
// only Gemini's held that out of sample (0 wrong, Jev 2).
export const THRESHOLDS: Record<'typesafe' | 'gemini', Thresholds> = {
  typesafe: { facts: 0.35, remedy: 0.7 },
  gemini: { facts: 0.1, remedy: 0.15 },
}

export type WalkDecision = { decision: 'apply' | 'ask'; reasons: string[] }

export function walkDecision(answers: Answers, t: Thresholds): WalkDecision {
  const p = (key: string) => {
    const a = answers[key]
    return a?.type === 'binary' ? a.p : undefined
  }
  const facts = p('needs_owner_facts')
  const remedy = p('remedy_choice')
  if (facts === undefined || remedy === undefined) return { decision: 'ask', reasons: ['an answer is missing'] }
  const reasons: string[] = []
  if (facts > t.facts) reasons.push(`needs_owner_facts ${facts.toFixed(2)} > ${t.facts}`)
  if (remedy > t.remedy) reasons.push(`remedy_choice ${remedy.toFixed(2)} > ${t.remedy}`)
  return { decision: reasons.length ? 'ask' : 'apply', reasons }
}
