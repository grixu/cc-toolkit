import type { Answers, Questions } from './decision.ts'

export const EVIDENCE_BUDGET = 8_000

type Source = { path: string; ref: string; symbol?: string; facts: string[] }
export type ExecutionEvidence = { path: string; sources: Source[] }[]

const safePath = (path: unknown): path is string => typeof path === 'string' && path.length > 0 && path.length <= 512 && !path.startsWith('/') && !path.split('/').some((p) => !p || p === '.' || p === '..') && !/[\0\r\n:]/.test(path)
const plainObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const keysOnly = (x: Record<string, unknown>, keys: string[]) => Object.keys(x).every((k) => keys.includes(k))

// Facts are exact excerpts, checked against a specific committed source before transmission.
export function validateEvidence(value: unknown, files: string[], refs: string[]): ExecutionEvidence {
  if (!Array.isArray(value) || value.length > 8 || JSON.stringify(value).length > EVIDENCE_BUDGET) throw new Error('execution_context must be an array of at most 8 entries and 8000 characters')
  const seen = new Set<string>()
  return value.map((entry) => {
    if (!plainObject(entry) || !keysOnly(entry, ['path', 'sources']) || !safePath(entry.path) || !files.includes(entry.path) || seen.has(entry.path) || !Array.isArray(entry.sources) || !entry.sources.length || entry.sources.length > 4) throw new Error('invalid execution_context entry or changed file')
    seen.add(entry.path)
    const sources = entry.sources.map((source: unknown) => {
      if (!plainObject(source) || !keysOnly(source, ['path', 'ref', 'symbol', 'facts']) || !safePath(source.path) || typeof source.ref !== 'string' || !refs.includes(source.ref) || (source.symbol !== undefined && (typeof source.symbol !== 'string' || !source.symbol.trim() || source.symbol.length > 200)) || !Array.isArray(source.facts) || !source.facts.length || source.facts.length > 4 || source.facts.some((f: unknown) => typeof f !== 'string' || !f.trim() || f.length > 500)) throw new Error('invalid execution_context source, ref or facts')
      return source as Source
    })
    return { path: entry.path, sources }
  })
}

export function evidenceForFiles(evidence: ExecutionEvidence, files: string[]): ExecutionEvidence {
  return evidence.filter((entry) => files.includes(entry.path))
}

export function stripTrailingRisk(context: string): string {
  const lines = context.split('\n')
  let fence: { char: string; length: number } | undefined
  let lastHeading = -1
  for (let i = 0; i < lines.length; i++) {
    const marker = lines[i].match(/^ {0,3}(`{3,}|~{3,})/)
    if (marker) {
      const run = marker[1]
      if (!fence) fence = { char: run[0], length: run.length }
      else if (run[0] === fence.char && run.length >= fence.length && /^\s*$/.test(lines[i].slice(marker[0].length))) fence = undefined
      continue
    }
    if (!fence && /^ {0,3}#{1,2}(?:\s+|$)/.test(lines[i])) lastHeading = i
  }
  if (lastHeading < 0 || !/^ {0,3}##\s+Risk\s*#*\s*$/i.test(lines[lastHeading])) return context
  const firstLine = lines.slice(lastHeading + 1).find((line) => line.trim()) ?? ''
  const generated = /^\s*\*\*.+?\*\*\s*·\s*(?:impact\s+.+?\s*·\s*)?confidence\s+.+?\s*·\s*assessed by\s+\S/i.test(firstLine)
  return generated ? lines.slice(0, lastHeading).join('\n').trimEnd() : context
}

const ATOMIC: Record<string, { question: string; yes: string; no: string }> = {
  server_enforcement: {
    question: 'Does the changed behavior rely on server-side enforcement of an access or eligibility boundary?',
    yes: 'The evidence shows the server enforces the boundary for the changed behavior.',
    no: 'The evidence shows the changed behavior relies only on client-side checks or configuration for this boundary.',
  },
  duplicate_external_effects: {
    question: 'Can a retry or repeated execution of the changed behavior produce duplicate external effects?',
    yes: 'The evidence shows that repeated execution can duplicate an external effect.',
    no: 'The evidence shows repeated execution is prevented or the external effect is idempotent.',
  },
  out_of_target_persisted_data: {
    question: 'Can the changed behavior modify or remove persisted data outside its intended target?',
    yes: 'The evidence shows a path that can modify or remove persisted data outside the intended target.',
    no: 'The evidence shows the changed operation is restricted to the intended target.',
  },
  shared_runtime_paths: {
    question: 'Does the change alter a runtime path also used by another feature or consumer?',
    yes: 'The evidence shows an altered runtime path shared with another feature or consumer.',
    no: 'The evidence shows the altered runtime path is confined to the changed feature.',
  },
  ordering_dependencies: {
    question: 'Does the change alter an ordering dependency between operations or deployments?',
    yes: 'The evidence shows an ordering dependency is added, removed, or changed.',
    no: 'The evidence shows the relevant ordering dependencies remain unchanged.',
  },
}

export function atomicQuestions(): Questions {
  return Object.fromEntries(Object.entries(ATOMIC).flatMap(([key, spec]) => [
    [key, { type: 'binary', instructions: spec.question, criteria: { yes: spec.yes, no: spec.no } }],
    [`${key}_evidence_sufficient`, { type: 'binary', instructions: `Is the provided diff and execution context sufficient to answer this question: ${spec.question}`, criteria: { yes: 'The provided evidence supports a definite yes or no.', no: 'The provided evidence leaves the answer unknown.' } }],
  ]))
}

export function experimentalAnswers(answers: Answers) {
  const numeric = (key: string) => {
    const answer = answers[key]
    const value = answer?.type === 'binary' ? answer.p : undefined
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : undefined
  }
  return Object.fromEntries(Object.keys(ATOMIC).map((key) => {
    const value = numeric(key)
    const evidence = numeric(`${key}_evidence_sufficient`)
    // Preliminary thresholds for an unvalidated experiment, not production risk policy.
    const status = value === undefined || evidence === undefined
      ? 'missing'
      : evidence < 0.7 ? 'unknown' : value >= 0.7 ? 'present' : value <= 0.3 ? 'absent' : 'unknown'
    return [key, { status, ...(value === undefined ? {} : { value }), ...(evidence === undefined ? {} : { evidence }) }]
  }))
}
