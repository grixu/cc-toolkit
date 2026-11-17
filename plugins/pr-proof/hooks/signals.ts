import type { Answers, Questions } from './decision.ts'
import { AGENT_FILE, PROSE_FILE, fileDiffs, type Part } from './jev.ts'

export const SUGGEST_AT = 0.7
export const REJECT_AT = 0.3

export const FACTS = {
  appearance_changed: '`diff` changes how a screen looks to a user, such as layout, styling or visible text.',
  ui_flow_changed:
    '`diff` changes what a user does across steps in the UI, or how the UI responds to a click, typing or other input. A change to layout, styling or text alone is not this.',
  endpoint_response_changed:
    '`diff` changes what an HTTP or RPC endpoint returns to its caller: its status, body, fields, error codes or headers, or which callers it allows.',
  command_output_changed:
    '`diff` changes what a command, script, migration, job, build or test run prints, logs or does when started from a terminal, including through the configuration or environment it reads. Code that only serves HTTP requests or renders a UI is not this.',
  no_behavior_change:
    'The change in `diff` leaves what the program does unchanged, as with documentation, comments, agent instructions, version bumps, removal of unreachable code or refactors that keep behaviour.',
}

export const KIND_OF_FACT = {
  appearance_changed: 'screenshots',
  ui_flow_changed: 'video',
  endpoint_response_changed: 'api',
  command_output_changed: 'terminal',
} as const

export type Signal = 'suggest' | 'reject' | 'uncertain'
export type ScoredSignal = { signal: Signal; p: number }
export type Kind = (typeof KIND_OF_FACT)[keyof typeof KIND_OF_FACT]
export function factQuestions(): Questions {
  return Object.fromEntries(Object.entries(FACTS).map(([key, instructions]) => [key, { type: 'binary', instructions }]))
}

const pYes = (answers: Answers, key: string) => {
  const answer = answers[key]
  return answer?.type === 'binary' ? answer.p : undefined
}

export function signalOf(p: number): Signal {
  if (p >= SUGGEST_AT) return 'suggest'
  if (p <= REJECT_AT) return 'reject'
  return 'uncertain'
}

export function missingFact(answers: Answers): string | undefined {
  return Object.keys(FACTS).find((key) => pYes(answers, key) === undefined)
}

// Prose sits apart from `diff`, since a doc describing a change reads to Jev as code making it; agent instructions
// stay in `diff` because they direct an agent. `commits` goes empty because commit messages argue for the change and
// pulled Jev's answers away from the labels; the field stays because the measured state kept it.
export function partState(part: Part, context: { diffstat: string }) {
  const code: string[] = []
  const prose: string[] = []
  for (const { path, text } of fileDiffs(part.diff)) {
    ;(PROSE_FILE.test(path) && !AGENT_FILE.test(path) ? prose : code).push(text)
  }
  return {
    commits: '',
    diffstat: context.diffstat,
    files: part.files,
    diff: code.join('\n'),
    ...(prose.length ? { prose: prose.join('\n') } : {}),
  }
}

// A kind counts when any part shows it, while one docs-only part must not suppress the proof another part needs.
export function aggregate(parts: Answers[]): { signals: Record<Kind, ScoredSignal>; noBehaviorChange: ScoredSignal; suppressed: boolean } {
  const sig = (p: number): ScoredSignal => ({ signal: signalOf(p), p })
  const values = (key: string) => parts.map((a) => pYes(a, key)!)
  const signals = Object.fromEntries(
    Object.entries(KIND_OF_FACT).map(([fact, kind]) => [kind, sig(Math.max(...values(fact)))]),
  ) as Record<Kind, ScoredSignal>
  const noBehaviorChange = sig(Math.min(...values('no_behavior_change')))
  return { signals, noBehaviorChange, suppressed: noBehaviorChange.signal === 'suggest' }
}
