// Pure helpers for the code story gate: no mods API calls, so the eval and the tool share them.
import type { Answers, ProviderName, Question, Questions } from './decision.ts'
import { AGENT_FILE, PROSE_FILE } from './paths.ts'
import { PROVIDER_NAMES, missingKey, type Keys } from './providers/index.ts'
import { COMMITS_CHAR_BUDGET, STATE_CHAR_BUDGET, clip, clipCommits, diffPath, split, type FileDiff } from './risk.ts'

const binary = (instructions: string, yes: string, no: string): Question => ({ type: 'binary', instructions, criteria: { yes, no } })

// Each fact says the change is too small or too plain for a story; all of them must hold in every part of the diff.
export const SKIP_FACTS: Questions = {
  cosmetic_only: binary(
    'Every change in `diff` and `prose` is cosmetic: typos, wording, formatting, whitespace or comments, leaving what the code does unchanged.',
    'Only typos, wording, formatting, whitespace or comments change.',
    'At least one change alters code, configuration, behaviour or the meaning of a document.',
  ),
  docs_only: binary(
    'Every change in `diff` and `prose` is documentation or reference text: READMEs, guides, specs, plans or reports; comment-only edits in code; or reference data in agent instructions (skills, rules, prompts, CLAUDE.md) such as tables, lists, names or paths that does not change what the agent does.',
    'Only documentation, comments or reference text change.',
    'Code, configuration, tests or what an agent does changes too.',
  ),
  tests_only: binary(
    'Every change in `diff` is to tests: test files, fixtures, mocks or test configuration, with production code unchanged.',
    'Only tests and their support files change.',
    'Production code, configuration or documentation changes too.',
  ),
  localized_fix: binary(
    'The change in `diff` is one fix or adjustment confined to one place, such as one function, one condition or a few lines, that a reader understands from the diff alone.',
    'One small, local fix or adjustment.',
    'Several changes, or one that spans functions or files a reader has to connect.',
  ),
  follows_existing_pattern: binary(
    'The change in `diff` repeats a pattern the code already uses, such as one more page, template, endpoint, option or config entry shaped like its neighbours, without new mechanisms.',
    'More of an existing pattern.',
    'A new mechanism, or a change to how an existing one works.',
  ),
  mostly_removal: binary(
    'Most of the change in `diff` deletes code, configuration or a feature, and what it adds is only what the removal needs.',
    'Mostly a removal.',
    'It adds or changes logic beyond what a removal needs.',
  ),
  behaviour_preserving: binary(
    'The `intent` or the diff shows that runtime behaviour and outputs stay the same: a refactor, move, rename, alignment with project conventions, or removal of dead code or unused dependencies.',
    'Behaviour and outputs stay the same.',
    'Something a user, caller or operator observes changes.',
  ),
  independent_small_edits: binary(
    'The change is several small edits with no call or data path between them, each understandable on its own, such as a bundle of unrelated fixes or cleanups.',
    'Unrelated small edits, each readable alone.',
    'One change, or edits that depend on each other.',
  ),
  config_value_change: binary(
    'The change in `diff` only changes values in configuration, CI, build or infrastructure files, such as versions, flags, limits, names or settings, and adds no new resource, service, job or pipeline step.',
    'Only values in existing configuration change.',
    'Code changes, or a resource, service, job or step is added or removed.',
  ),
}

// The opposite fact: one part that shows it is enough for a story, whatever the skip facts say.
export const STORY_FACTS: Questions = {
  new_or_restructured_flow: binary(
    'The change in `diff` adds a module, feature or flow, or changes the order in which several components call each other, so a reader needs the steps across files to understand it. Deleting code, editing reference text or documentation, and fixing one subsystem in place are not a new flow.',
    'It adds a flow or reorders how components work together across files.',
    'No flow is added or reordered: it removes code, edits text, or changes things in place.',
  ),
  agent_procedure_change: binary(
    'The change alters what an agent does during a run, as written in skills, commands, rules, prompts or CLAUDE.md: when it asks, waits or stops, which tools it may use, or which steps it takes. Editing only the reference data an agent reads (tables, lists, names, paths) is not a procedure change.',
    'An agent will act differently in a run.',
    'No agent instruction changes, or only reference data does.',
  ),
  removes_working_mechanism: binary(
    'The change removes or weakens a mechanism that was doing work, such as a cache, guard, retry, check, step or a feature in use, for a reason the `intent`, commits or comments give: a trade-off, a measurement or a cost. Deleting dead or unused code is not this.',
    'A working mechanism goes, for a stated reason.',
    'Nothing in use is removed, or only dead code is.',
  ),
  cause_outside_change: binary(
    'The change fixes a defect whose cause lies in code it does not modify, visible only in the unchanged lines around it or explained in the `intent`, so a reader must look past the changed lines to see why the fix works.',
    'The defect sits in code the change leaves as it is.',
    'No defect is fixed, or its cause is in the changed lines.',
  ),
}

export function storyQuestions(): Questions {
  return { ...SKIP_FACTS, ...STORY_FACTS }
}

export const DIFFSTAT_CHAR_BUDGET = 4_000
// A diff past this many requests is far too large to skip a story for, so it is never sent at all.
export const MAX_STORY_PARTS = 4

export type StoryPlan = { tooLarge: true } | { tooLarge: false; states: ReturnType<typeof storyState>[] }

export const STORY_DIFF_BUDGET = STATE_CHAR_BUDGET - DIFFSTAT_CHAR_BUDGET
export const DESCRIPTION_CHAR_BUDGET = 6_000
export const INTENT_CHAR_BUDGET = DESCRIPTION_CHAR_BUDGET + COMMITS_CHAR_BUDGET + 500

export type Intent = { title: string; description: string; commits: string }

// Sections pr-open generates from its own results would hand the gate its answer, so they never reach it.
const GENERATED_SECTION = /^## (Code story|Proof|Risk)\b[\s\S]*?(?=^## |^\[[^\]]+\]: |(?![\s\S]))/gm

export function storyIntent(title: string, body: string, commits: string): Intent {
  return {
    title,
    description: clip(body.replace(GENERATED_SECTION, '').trim(), DESCRIPTION_CHAR_BUDGET),
    commits: clipCommits(commits.trim()),
  }
}

export function storyDiffBudget(intent?: Intent): number {
  return STORY_DIFF_BUDGET - (intent ? INTENT_CHAR_BUDGET : 0)
}

export function planStory(files: FileDiff[], diffstat: string, intent?: Intent): StoryPlan {
  const stat = clip(diffstat.trimEnd(), DIFFSTAT_CHAR_BUDGET)
  const plan = split(files, storyDiffBudget(intent), MAX_STORY_PARTS)
  if (plan.skippedFiles.length) return { tooLarge: true }
  const parts = plan.parts.length ? plan.parts : [{ files: [], diff: '(no reviewable text diff: only lockfiles, binary or generated files changed)' }]
  return { tooLarge: false, states: parts.map((p) => storyState(p, stat, intent)) }
}

// The diffstat and intent travel in every part so a model judging one part still sees the whole change.
export function storyState(part: { files: string[]; diff: string }, diffstat: string, intent?: Intent) {
  const code: string[] = []
  const prose: string[] = []
  for (const text of part.diff.split(/\n(?=diff --git a\/)/)) {
    const path = diffPath(text) ?? ''
    ;(PROSE_FILE.test(path) && !AGENT_FILE.test(path) ? prose : code).push(text)
  }
  return {
    ...(intent ? { intent } : {}),
    diffstat,
    files: part.files,
    diff: code.join('\n'),
    ...(prose.length ? { prose: prose.join('\n') } : {}),
  }
}

export type Facts = Record<string, number>
export type Thresholds = { skipAt: number; storyAt: number }

const pYes = (answers: Answers, key: string) => {
  const a = answers[key]
  return a?.type === 'binary' ? a.p : undefined
}

export function missingFact(answers: Answers): string | undefined {
  return Object.keys(storyQuestions()).find((key) => pYes(answers, key) === undefined)
}

// A skip fact holds for the change only as far as it holds in its weakest part; a story fact in its strongest.
export function aggregateFacts(parts: Answers[]): Facts {
  const values = (key: string) => parts.map((a) => pYes(a, key) ?? 0)
  return {
    ...Object.fromEntries(Object.keys(SKIP_FACTS).map((key) => [key, Math.min(...values(key))])),
    ...Object.fromEntries(Object.keys(STORY_FACTS).map((key) => [key, Math.max(...values(key))])),
  }
}

export function averageFacts(list: Facts[]): Facts {
  return Object.fromEntries(Object.keys(storyQuestions()).map((key) => [key, list.reduce((sum, f) => sum + (f[key] ?? 0), 0) / list.length]))
}

export function decide(facts: Facts, t: Thresholds): { story: boolean; reason: string } {
  const flow = Object.keys(STORY_FACTS).find((key) => (facts[key] ?? 0) >= t.storyAt)
  if (flow) return { story: true, reason: flow }
  const skip = Object.keys(SKIP_FACTS).find((key) => (facts[key] ?? 0) >= t.skipAt)
  return skip ? { story: false, reason: skip } : { story: true, reason: 'no skip fact held' }
}

export type GateBackend = ProviderName | 'both'

// Fitted on 37 owner-labelled PRs so that none labelled `story` is skipped, then scored on 24 others: 0 of 11 story
// PRs skipped by any of the three, and 8 (both), 7 (Jev) and 10 (Gemini) of 13 skip PRs skipped. Only `both` was
// frozen before the holdout ran; the single-backend pairs were fitted on the dev set alone, after it.
export const THRESHOLDS: Record<GateBackend, Thresholds> = {
  both: { skipAt: 0.8, storyAt: 0.9 },
  typesafe: { skipAt: 0.725, storyAt: 0.9 },
  gemini: { skipAt: 0.775, storyAt: 0.9 },
}

export const GATE_MODES = ['auto', ...PROVIDER_NAMES, 'both'] as const

// Unlike pr_risk, auto never asks which backend: pr-open calls the gate mid-run, so with both keys it runs both.
export function chooseGateBackends(options, keys: Keys): ProviderName[] {
  const configured = typeof options?.story_gate_backend === 'string' ? options.story_gate_backend.trim() : ''
  const mode = (GATE_MODES as readonly string[]).includes(configured) ? configured : 'auto'
  const names = mode === 'auto' ? PROVIDER_NAMES.filter((name) => keys[name]) : mode === 'both' ? [...PROVIDER_NAMES] : [mode as ProviderName]
  if (!names.length) throw new Error(PROVIDER_NAMES.map((name) => missingKey(name, 'dev-kit')).join('; or '))
  const missing = names.find((name) => !keys[name])
  if (missing) throw new Error(missingKey(missing, 'dev-kit'))
  return names
}

export function gateKey(answered: ProviderName[]): GateBackend {
  return answered.length > 1 ? 'both' : answered[0]
}
