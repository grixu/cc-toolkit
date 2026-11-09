// The factor scorer: Jev answers per-part factor questions (how complex the change is, how much it alters what users
// get, the impact of a mistake, which manual evidence would show it works, whether a test could check it), and the
// level comes from the impact and the complexity of the riskiest parts. A PR description that carries the evidence a
// low-stakes part needs lowers that part's likelihood one step.
import { IMPACT_LEVELS, LIKELIHOOD_LEVELS, RISK_MATRIX, questions, type FileStatus, type Slice } from './risk.ts'

type Answer = { score?: number; probabilities?: Record<string, number>; noul?: number; confidence?: number }
type Answers = Record<string, Answer>
type State = { slice?: string; files: string[]; diff: string }

export const FACTOR_REPEATS = 2
const MAX_TESTS_LISTED = 60
// Complexity has five levels and likelihood four: logic that depends on code outside the diff is as hard to get right
// as several interacting paths inside it.
const COMPLEXITY_TO_LIKELIHOOD = [0, 1, 2, 2, 3]
export const COMPLEXITY_LEVELS = ['edits', 'simple logic', 'interacting logic', 'outside dependency', 'ordering or shared state']
const EVIDENCE = ['video', 'screenshots', 'api_dump'] as const
type Evidence = (typeof EVIDENCE)[number]
const CONFIDENT_NEED = 0.7
const PLAUSIBLE_NEED = 0.3
const UNTESTABLE = 0.3

const PROSE_FILE = /(^|\/)\.changeset\/|\.(md|mdx|markdown|txt|rst|adoc|mmd|mermaid|puml)$/i
const AGENT_FILE = /(^|\/)(CLAUDE|AGENTS|SKILL)\.md$|(^|\/)\.(claude|cursor|github\/prompts)\/|(^|\/)(commands|agents|skills|rules)\/[^/]+\.mdx?$/i
const TEST_FILE = /(^|\/)(__tests__|tests?|spec|e2e|e2e-[^/]+|__mocks__|mocks?|fixtures?|__fixtures__|page-?objects?|test-?utils|testing|cypress|playwright)\/|[._-](test|spec|stories)\.[^/]+$|(^|\/)(vitest|jest|playwright|cypress)\.(config|setup)[^/]*$/i
const CONFIG_FILE = new RegExp([
  /(^|\/)\.github\/|(^|\/)\.gitlab-ci|(^|\/)\.circleci\/|(^|\/)\.buildkite\//.source,
  /(^|\/)(Dockerfile|Containerfile)[^/]*$|(^|\/)docker-compose[^/]*$|(^|\/)compose\.ya?ml$/.source,
  /\.(tf|tfvars|hcl)$|(^|\/)Chart\.yaml$|(^|\/)values[^/]*\.ya?ml$|(^|\/)(k8s|helm|charts|deploy|infra|terraform|kustomize)\//.source,
  /(^|\/)(package|composer|tsconfig[^/]*|jsconfig|renovate|turbo|nx|lerna|deno|biome)\.json5?$/.source,
  /(^|\/)(pnpm-lock\.yaml|pnpm-workspace\.yaml|package-lock\.json|yarn\.lock|go\.mod|go\.sum|Cargo\.(toml|lock)|pyproject\.toml|poetry\.lock|requirements[^/]*\.txt|Gemfile(\.lock)?|\.terraform\.lock\.hcl)$/.source,
  /(^|\/)\.(env[^/]*|npmrc|nvmrc|node-version|tool-versions|editorconfig|gitignore|gitattributes|dockerignore|prettierrc[^/]*|eslintrc[^/]*|stylelintrc[^/]*|browserslistrc|babelrc[^/]*)$/.source,
  /(^|\/)[^/]*\.config\.(js|cjs|mjs|ts|cts|mts|json)$|(^|\/)(Makefile|Procfile|Taskfile\.ya?ml|justfile)$/.source,
  /\.(ya?ml|toml|ini|cfg|conf|properties)$/.source,
].join('|'), 'i')

// Agent instructions are prose that steers an agent, so they count as configuration, not documentation.
export function kindOf(path: string): 'documentation' | 'configuration' | 'test' | 'code' {
  if (PROSE_FILE.test(path) && !AGENT_FILE.test(path)) return 'documentation'
  if (AGENT_FILE.test(path)) return 'configuration'
  if (TEST_FILE.test(path)) return 'test'
  if (CONFIG_FILE.test(path)) return 'configuration'
  return 'code'
}

// Per-file blocks of a unified diff, keyed by the post-image path.
export function fileBlocks(diff: string) {
  const blocks: { path: string; status: string; added: number; deleted: number; text: string }[] = []
  for (const block of diff.split(/(?=^diff --git )/m)) {
    if (!block.startsWith('diff --git ')) continue
    const m = block.match(/^diff --git a\/(.+?) b\/(.+)$/m)
    const path = m ? m[2] : ''
    const status = /^new file mode/m.test(block) ? 'added' : /^deleted file mode/m.test(block) ? 'deleted' : /^rename from/m.test(block) ? 'renamed' : 'modified'
    let added = 0
    let deleted = 0
    for (const line of block.split('\n')) {
      if (line.startsWith('+++') || line.startsWith('---')) continue
      if (line.startsWith('+')) added++
      else if (line.startsWith('-')) deleted++
    }
    blocks.push({ path, status, added, deleted, text: block })
  }
  return blocks
}

// The factor questions describe what the code does; tests beside it read to Jev as more code, so a part with code
// loses its test hunks, and a part of tests alone is assessed as tests. Prose is already outside the part's `diff`.
export function factorState(state: State): { testOnly: boolean; state: State } | undefined {
  const assessed = fileBlocks(state.diff ?? '').filter((b) => kindOf(b.path) !== 'documentation')
  if (!assessed.length) return undefined
  const nonTest = assessed.filter((b) => kindOf(b.path) !== 'test')
  const testOnly = nonTest.length === 0
  const used = testOnly ? assessed : nonTest
  return {
    testOnly,
    state: {
      ...(state.slice ? { slice: state.slice } : {}),
      files: used.map((b) => `${b.path}: ${b.status} +${b.added} −${b.deleted}`),
      diff: used.map((b) => b.text.replace(/\n$/, '')).join('\n'),
    },
  }
}

export function testsInChange(paths: string[]): string[] {
  const tests = [...new Set(paths.filter((p) => kindOf(p) === 'test'))].sort()
  return tests.length ? tests.slice(0, MAX_TESTS_LISTED) : ['(none)']
}

const SCORE_QUESTIONS = () => ({
  complexity: {
    type: 'score',
    instructions: 'How complex is the change in `diff`? Judge how much a reader must understand together to know it is right, not how many lines it touches.',
    criteria: [
      'Each edit replaces a value, a name, a piece of text or a location, and each one can be checked on its own by reading it.',
      'The change adds or alters one small piece of straightforward logic that a reader can follow from start to end within the diff.',
      'The change adds or alters several conditions, paths or transformations that must agree with each other, and a reader has to trace them together, within the diff, to see that they are right.',
      { what: 'Whether the changed logic is right depends on how something outside the diff behaves: another component, a library, a tool, a platform or data the diff does not show.',
        not_for: 'Calling code outside the diff the same way it was called before, or setting a value whose whole effect is visible in the diff.' },
      'Whether the change is right depends on the order or timing in which things happen, or on state that several steps, runs, services or deployments read and change.',
    ],
  },
  behaviour_change: {
    type: 'score',
    instructions: "How much does the change in `diff` alter what its users get? Its users are whoever runs, calls or sees what the change changes: people, other programs, or the team's own tooling. Judge the size of the alteration, not how many users there are.",
    criteria: [
      'Its users get exactly what they got before; only how it is built changes.',
      'Its users notice a small difference in something they already use, in how it reads or looks or in what it gives in an uncommon case, and in ordinary use they use it and get the same results as before.',
      'Its users get something new next to what they already had, and everything they already use works as before.',
      'Something its users already rely on gives a different result, accepts different input or applies under different conditions in ordinary use, while it remains the same feature doing the same job.',
      { what: 'Something its users relied on is replaced, taken away or reshaped, so they must change what they do or what they expect.',
        not_for: 'Taking away code that no user could reach.' },
    ],
  },
  user_reach: {
    type: 'score',
    instructions: 'If the change in `diff` is wrong, who does it reach?',
    criteria: [
      'No one: nothing that anyone runs or sees changes.',
      { what: "Only this team: local development setup, coding-agent instructions, the team's own CI checks or alerts.",
        not_for: 'Anything deployed where users or other teams meet it.' },
      { what: 'Some users: one feature, an admin page or a rarely used path.',
        not_for: 'A core flow most users go through.' },
      'Most users: a core flow, a whole service or its public API.',
      'Other teams or outside consumers: builds, deployments, shared packages, services or integrations that depend on this repository.',
    ],
  },
  reversibility: {
    type: 'score',
    instructions: 'If the change in `diff` turns out wrong, how hard is it to roll back?',
    criteria: [
      'Reverting the change restores everything.',
      { what: 'Reverting works with a routine extra step: a redeploy, a restart, regenerated clients, or reverting two services together.',
        not_for: 'Data or state that has to be repaired by hand.' },
      'Reverting leaves state behind that must be repaired by hand: written or migrated data, caches, indexes, flag state or downstream copies.',
      'The effects cannot be undone: messages sent, payments taken, data deleted or exposed, outside consumers already broken.',
    ],
  },
  failure_breadth: {
    type: 'score',
    instructions: 'How widely does the change in `diff` open new ways for the system to go wrong? Judge the situations it creates, not the number of checks or error messages in the diff, and not how well they are handled.',
    criteria: [
      'The change adds no new way to go wrong: it introduces no condition, input, call, stored value or step, and whatever it removes or replaces leaves every remaining path behaving as before.',
      'One new or altered decision, input or call, in one place, so a mistake there misbehaves in that place only.',
      'Several new or altered decisions, inputs or steps within one component, so one of them failing can disturb the others in that component.',
      'A new or altered agreement between components, such as a format, a contract or a shared value that both sides must follow, so the sides can disagree without either being wrong on its own, whether or not both sides change in `diff`.',
      'New dependence on things that fail on their own, such as timing, load, the network, another service or stale state, so the change can go wrong even when every written line is correct.',
    ],
  },
  failure_handling: {
    type: 'score',
    instructions: 'When the new or altered code in `diff` fails, how well is that handled?',
    criteria: [
      { what: 'Failures pass silently: the changed code catches or ignores them and carries on with a wrong or missing result that no caller or person is told about.',
        not_for: 'A fallback value that is the intended result for that case.' },
      'Failures are not hidden but not contained: they stop the operation and reach whoever called it as an error, with no cleanup, so work already done can leave stored state inconsistent.',
      'Failures are either handled where they happen or stop the operation with a clear error, and stored state stays consistent.',
      'Failures are handled, contained and recovered from or rolled back, leaving the system in a known-good state.',
    ],
  },
  defect_impact: questions().defect_impact,
})

const EVIDENCE_QUESTIONS = {
  evidence_video: {
    type: 'noul',
    instructions: 'The change in `diff` alters how a user interface behaves while a person uses it, over more than one step or moment.',
    criteria: {
      true: 'What happens after a person acts on a screen or terminal, or waits on it, changes: an interaction, the steps of a flow, navigation, a transition, or what appears while something loads or fails.',
      false: 'Only what a screen shows at rest changes, or no user interface changes.',
    },
  },
  evidence_screenshots: {
    type: 'noul',
    instructions: 'The change in `diff` alters what a screen shows at rest: its layout, styling, content or rendered text.',
    criteria: {
      true: 'A person comparing still images of the screen before and after the change would see what changed.',
      false: 'Nothing rendered on a screen changes, or what changes shows only while the interface is being used.',
    },
  },
  evidence_api_dump: {
    type: 'noul',
    instructions: 'The change in `diff` alters what this system accepts from or returns to another program across a process or network boundary (a request, response, status code, event, message or file), including an interface that no screen uses.',
    criteria: {
      true: 'Code in `diff` changes the requests, responses, status codes, events or payloads that a consumer sends or receives.',
      false: 'Every interface accepts and returns what it did before, or the only changed interfaces are functions, types or modules that other code calls inside the same running program.',
    },
  },
}

const TESTABLE_QUESTION = {
  automation_testable: {
    type: 'noul',
    instructions: 'Could the behaviour changed in `diff` reasonably be checked by an automated test, at effort proportionate to the change? Judge whether such a test could be written and what it would have to rebuild, not whether this change supplies one.',
    criteria: {
      true: 'A test could run the changed code or drive the interface it changes and check what it computes, decides, stores, returns or renders, without a person judging the result and without a live outside system.',
      false: 'A meaningful check requires human judgement, or conditions that cannot reasonably be reproduced or controlled without a live outside system at effort proportionate to the change. Missing tests do not establish that automation is infeasible.',
    },
  },
}

// A test runner contains its own failures and tests need no manual evidence, so a part of tests alone skips those
// questions. Testability goes in its own request, with the change's tests listed beside the diff.
export function factorQuestions(testOnly: boolean): { factor: Record<string, unknown>; testable?: Record<string, unknown> } {
  const factor: Record<string, unknown> = { ...SCORE_QUESTIONS(), ...(testOnly ? {} : EVIDENCE_QUESTIONS) }
  if (testOnly) delete factor.failure_handling
  return testOnly ? { factor } : { factor, testable: TESTABLE_QUESTION }
}

export function factorBodies(model: string, state: State, tests: string[]): { testOnly: boolean; bodies: string[] } | undefined {
  const assessed = factorState(state)
  if (!assessed) return undefined
  const q = factorQuestions(assessed.testOnly)
  return {
    testOnly: assessed.testOnly,
    bodies: [
      JSON.stringify({ model, state: assessed.state, questions: q.factor }),
      ...(q.testable ? [JSON.stringify({ model, state: { ...assessed.state, tests_in_change: tests }, questions: q.testable })] : []),
    ],
  }
}

// Jev's answers move between two identical asks as much as a whole wording change does, so the probabilities of
// several asks are averaged before the median is read.
export function averageAnswers(list: Answers[]): Answers {
  const out: Answers = {}
  for (const key of new Set(list.flatMap((a) => Object.keys(a)))) {
    const xs = list.map((a) => a[key]).filter(Boolean)
    if (xs.every((x) => x.probabilities)) {
      const p: Record<string, number> = {}
      for (const x of xs) for (const [k, v] of Object.entries(x.probabilities!)) p[k] = (p[k] ?? 0) + v / xs.length
      out[key] = { probabilities: p }
    } else if (xs.every((x) => Number.isFinite(x.noul))) out[key] = { noul: xs.reduce((s, x) => s + x.noul!, 0) / xs.length }
  }
  return out
}

export function median(answer: Answer | undefined, count: number): number | null {
  const p = answer?.probabilities
  if (!p) return null
  let total = 0
  for (let i = 0; i < count; i++) {
    total += p[String(i)] ?? 0
    if (total >= 0.5) return i
  }
  return count - 1
}

export type FactorGroup = {
  slice?: number
  testOnly: boolean
  c: number
  di: number
  b: number | null
  need: Record<Evidence, number>
  testable: number | null
}

export function factorGroup(answers: Answers, testOnly: boolean, slice?: number): FactorGroup | undefined {
  const c = median(answers.complexity, 5)
  const di = median(answers.defect_impact, 5)
  if (c === null || di === null) return undefined
  return {
    ...(slice === undefined ? {} : { slice }),
    testOnly,
    c,
    di,
    b: median(answers.behaviour_change, 5),
    need: Object.fromEntries(EVIDENCE.map((t) => [t, testOnly ? 0 : answers['evidence_' + t]?.noul ?? 0])) as Record<Evidence, number>,
    testable: testOnly ? null : answers.automation_testable?.noul ?? null,
  }
}

// Manual evidence in a PR description: an uploaded image, a video or a Loom link, or a request or response in a code block.
export function evidenceIn(body: string): Set<Evidence> {
  const text = body ?? ''
  const present = new Set<Evidence>()
  const upload = /https:\/\/(github\.com\/user-attachments\/assets\/[\w-]+|private-user-images\.githubusercontent\.com\/\S+|user-images\.githubusercontent\.com\/\S+)/
  const imgs = [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)|<img[^>]*src="([^"]+)"/gi)].map((m) => m[1] ?? m[2])
  if (imgs.some((u) => upload.test(u) && !/\.(mp4|mov|webm)(\?|$)/i.test(u))) present.add('screenshots')
  const bare = text.split('\n').map((l) => l.trim()).filter((l) => /^https:\/\/github\.com\/user-attachments\/assets\/[\w-]+$/.test(l))
  if (bare.length || /\.(mp4|mov|webm)(\?|\)|\s|$)/i.test(text) || /loom\.com\/share\//i.test(text)) present.add('video')
  for (const m of text.matchAll(/```[\w-]*\n([\s\S]*?)```/g))
    if (/^(curl |HTTP\/\d)|"status(Code)?"\s*:|^\s*\{\s*"[\w-]+"\s*:/im.test(m[1])) present.add('api_dump')
  // A recording shows every screen it passes through.
  if (present.has('video')) present.add('screenshots')
  return present
}

type Scored = FactorGroup & { tested: boolean; policyClears: boolean; majorBump: boolean; testGap: boolean; credit: boolean; L: number }

// A part that changes behaviour with no test beside it, where the testing policy does not clear it and a test could be
// written, has a gap that manual evidence does not close.
const hasTestGap = (g: Omit<Scored, 'testGap' | 'credit' | 'L'>) =>
  !g.testOnly && !g.tested && !g.policyClears && (g.b ?? 0) >= 1 && !(g.testable !== null && g.testable <= UNTESTABLE)

// Credit only where stakes are low (impact at most feature) and the description covers every need Jev finds plausible.
function evidenceCredit(g: Omit<Scored, 'credit' | 'L'>, covered: Set<Evidence>): boolean {
  if (g.testOnly || g.di > 2 || g.testGap) return false
  const confident = EVIDENCE.filter((t) => g.need[t] >= CONFIDENT_NEED)
  return confident.length > 0 && EVIDENCE.filter((t) => g.need[t] > PLAUSIBLE_NEED).every((t) => covered.has(t))
}

export function scoreFactors(
  groups: FactorGroup[],
  ctx: { slices: Slice[]; files: string[]; statuses: Map<string, FileStatus>; testsNotRequired: Set<number>; context: string },
) {
  const stem = (p: string) => (p.split('/').pop() ?? p).replace(/\.[^.]+$/, '')
  const testStems = new Set(ctx.files.filter((p) => kindOf(p) === 'test').map((p) => stem(p).replace(/([._-](test|spec|unit|integration|e2e|stories))+$/i, '')))
  const covered = evidenceIn(ctx.context)
  const scored: Scored[] = groups.map((g) => {
    const index = g.slice ?? 0
    const files = ctx.slices.length ? ctx.slices[index]?.files ?? [] : ctx.files
    const base = {
      ...g,
      tested: files.some((p) => kindOf(p) === 'test' || testStems.has(stem(p))),
      policyClears: ctx.testsNotRequired.has(index),
      majorBump: files.some((p) => (ctx.statuses.get(p)?.majorBumps?.length ?? 0) > 0),
    }
    const withGap = { ...base, testGap: hasTestGap(base) }
    const credit = evidenceCredit(withGap, covered)
    // The breaking changes of a new major version lie outside the diff, so no evidence lowers that part below non-trivial.
    const floor = base.majorBump ? 2 : 0
    const L = Math.max(COMPLEXITY_TO_LIKELIHOOD[g.c], floor)
    return { ...withGap, credit, L: credit ? Math.max(L - 1, floor) : L }
  })
  return { ...levelOf(scored), groups: scored, covered: EVIDENCE.filter((t) => covered.has(t)) }
}

// The worst impact meets the worst likelihood across parts, and a severe impact anywhere with non-trivial logic
// anywhere is critical whatever evidence came with it.
export function levelOf(groups: Scored[]): { rank: number; impact: number; likelihood: number; guard: boolean } {
  if (!groups.length) return { rank: 0, impact: 0, likelihood: 0, guard: false }
  const impact = Math.max(...groups.map((g) => g.di))
  const likelihood = Math.max(...groups.map((g) => g.L))
  const guard = impact === 4 && Math.max(...groups.map((g) => COMPLEXITY_TO_LIKELIHOOD[g.c])) >= 2
  return { rank: guard ? 3 : RISK_MATRIX[impact][likelihood], impact, likelihood, guard }
}

function notesOf(g: Scored): string[] {
  const notes: string[] = []
  if (g.majorBump && COMPLEXITY_TO_LIKELIHOOD[g.c] < 2)
    notes.push('likelihood raised to non-trivial: the slice moves a runtime dependency to a new major version, whose changes lie outside the diff')
  if (g.credit) notes.push('likelihood lowered one step: the description carries the manual evidence this low-stakes change needs')
  return notes
}

// Replaces the level, impact and likelihood of a two-axis report with the factor scorer's; change types, intents
// and flags still come from the diff and intent requests. A slice in `missing` has no factor answers, so it keeps its
// two-axis row and level, and the level of the change does not fall below it: a partial outage clears nothing.
export function factorReport<R extends { level: string; slices: { title?: string; files: string[]; level?: string }[]; label: { enabled: boolean; name: string; all: string[] } }>(
  report: R,
  score: ReturnType<typeof scoreFactors>,
  levels: string[],
  labelFor: (level: string) => string,
  missing: Set<number> = new Set(),
) {
  const unscored = [...missing].filter((i) => !score.groups.some((g) => (g.slice ?? 0) === i))
  const floor = Math.max(0, ...unscored.map((i) => levels.indexOf(report.slices[i]?.level ?? report.level)))
  const describe = (groups: Scored[]) => {
    const l = levelOf(groups)
    const needed = EVIDENCE.filter((t) => groups.some((g) => g.need[t] > PLAUSIBLE_NEED))
    return {
      level: levels[l.rank],
      impact: { level: IMPACT_LEVELS[l.impact] },
      likelihood: { level: LIKELIHOOD_LEVELS[l.likelihood] },
      complexity: COMPLEXITY_LEVELS[groups.length ? Math.max(...groups.map((g) => g.c)) : 0],
      evidence: { needed, provided: needed.filter((t) => score.covered.includes(t)), credited: groups.some((g) => g.credit) },
      testGap: groups.some((g) => g.testGap),
      adjustments: [...new Set(groups.flatMap(notesOf))],
      guard: l.guard,
    }
  }
  const whole = describe(score.groups)
  const level = levels[Math.max(score.rank, floor)]
  return {
    ...report,
    scorer: 'factors',
    level,
    impact: whole.impact,
    likelihood: whole.likelihood,
    complexity: whole.complexity,
    evidence: { ...whole.evidence, provided: score.covered },
    adjustments: [
      ...(score.guard ? ['level raised to critical: a mistake could be severe and the logic is non-trivial'] : []),
      ...whole.adjustments,
    ],
    slices: report.slices.map((s, i) => {
      if (unscored.includes(i)) return { ...s, factors: 'missing' }
      const { guard: _guard, ...rest } = describe(score.groups.filter((g) => (g.slice ?? 0) === i))
      return { ...s, ...rest }
    }),
    label: { ...report.label, name: labelFor(level) },
  }
}
