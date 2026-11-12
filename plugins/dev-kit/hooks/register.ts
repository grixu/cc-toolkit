import {
  MODES,
  appendLine,
  backendFor,
  backendKeys,
  chooseBackends,
  choiceNeeded,
  hasAnyKey,
  httpError,
  label,
  readResponse,
  requestInit,
  tooLong,
  type Backend,
  type BackendName,
} from './backend.ts'
import { DEFAULT_MODEL, EVIDENCE_BUDGET, atomicQuestions, evidenceForFiles, experimentalAnswers, stripTrailingRisk, validateEvidence, type ExecutionEvidence } from './evidence.ts'
import { FACTOR_REPEATS, averageAnswers, factorBodies, factorGroup, factorReport, scoreFactors, testsInChange, type FactorGroup } from './factors.ts'

import {
  MAX_PARTS,
  RETRYABLE,
  SLICING_SYSTEM,
  STATE_CHAR_BUDGET,
  aggregate,
  assignSlices,
  clipBulk,
  clipCommits,
  endpointUrl,
  fileStatuses,
  groupsOf,
  halve,
  intentQuestions,
  intentState,
  isDependencyManifest,
  isExcluded,
  isSafeRef,
  labelFor,
  majorBumps,
  missingAnswer,
  missingIntent,
  parseSlices,
  partState,
  policyQuestions,
  policyState,
  pool,
  questions,
  readConfig,
  retryDelay,
  slicingPrompt,
  split,
  splitSlices,
  testPaths,
  testsNeeded,
  trimmedOption,
  untestedGroups,
  type FileDiff,
  type FileStatus,
  type IntentResult,
  type PartResult,
  type Slice,
} from './risk.ts'

const TOOL = 'pr_risk'
const LOW_CONFIDENCE = 0.5
const NOT_ASSESSED_SAMPLE = 20
const SLICING_MODEL = 'haiku'
const CONCURRENCY = 4
const MAX_ATTEMPTS = 3
// Each split halves the request, so three levels cover a part at eight times the token limit.
const MAX_SPLIT_DEPTH = 3
const COMPARE_LOG = '.cache/dev-kit/compare.jsonl'
const DESCRIPTION =
  'Assess the risk a branch introduces, with a decision model: TypeSafe Jev, Gemini Decision, or both side by side. Groups the changed files of <base>...HEAD into vertical slices, sends each slice\'s diff to the model and, separately, the change\'s purpose with each slice\'s file statistics, and returns JSON: for the change and for each slice, the risk level with the impact of a mistake, its complexity and likelihood, the manual evidence it needs and whether the description carries it, any rule that adjusted them, what the change does (adds, changes, fixes, restructures), the types of change, and risk flags; plus confidence, the GitHub label to apply, how much of the diff was assessed, and the backend and model that answered. With both backends, `comparison` holds each backend\'s levels. Call it when preparing or reviewing a pull request.'

export function register(on, options) {
  const config = readConfig(options)

  on('session.start', async ($, e, next) => {
    // Without a key nothing may leave the machine, so the tool does not exist at all.
    if (hasAnyKey(await backendKeys($, options))) {
      try {
        await $.tool.register({
          name: TOOL,
          description: DESCRIPTION,
          inputSchema: {
            type: 'object',
            properties: {
              base: { type: 'string', description: 'The branch the change merges into, such as main' },
              context: {
                type: 'string',
                description:
                  "Optional. What the change is for: the pull request's title and description, and the linked ticket's title and description when known. Used only to judge whether each slice adds, changes, fixes or restructures behaviour.",
              },
              testing_policy: {
                type: 'string',
                description:
                  "Optional. The repository's rules on what gets tested and how, in a few sentences, from its CLAUDE.md, AGENTS.md, CONTRIBUTING or CI: which code needs unit or integration tests, what is left to e2e, and what is never tested. Used only to decide whether a slice that changes logic without a test breaks those rules.",
              },
              execution_context: {
                type: 'array',
                maxItems: 8,
                description: 'Optional committed source excerpts relevant to changed files; refs must be full base or HEAD commit IDs.',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['path', 'sources'],
                  properties: {
                    path: { type: 'string' },
                    sources: {
                      type: 'array',
                      minItems: 1,
                      maxItems: 4,
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['path', 'ref', 'facts'],
                        properties: {
                          path: { type: 'string' },
                          ref: { type: 'string' },
                          symbol: { type: 'string' },
                          facts: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string' } },
                        },
                      },
                    },
                  },
                },
              },
              backend: {
                type: 'string',
                enum: [...MODES],
                description: 'Optional. The decision backend the user chose: typesafe, gemini or both. Pass it only with the user\'s answer after a "Backend choice needed" result.',
              },
              risk_policy: { type: 'string', enum: ['calibrated-v1', 'evidence-v1'], description: 'Optional risk policy; evidence-v1 is stricter and unvalidated.' },
              risk_experiment: { type: 'string', enum: ['atomic-v1'], description: 'Optional experimental signals; does not change risk policy.' },
              slices: {
                type: 'array',
                description:
                  'Optional. The change grouped into vertical slices: each one feature, fix or concern with its code, tests, configuration and docs together, and every changed file, as git diff prints its path, in exactly one slice. Omit it and the tool groups the files itself.',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', description: 'What the slice changes, in a few neutral words' },
                    files: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['title', 'files'],
                },
              },
            },
            required: ['base'],
          },
        })
      } catch {
        // A refused registration leaves the session without the tool, which pr-open treats as unconfigured.
      }
    }
    return next(e)
  })

  on('tool.call', { tool: 'mcp__dev-kit__pr_risk' }, async ($, e) => {
    try {
      const report = await assess($, e.base, options, config, e.slices, e.context, e.testing_policy, e.execution_context, e.risk_experiment, e.risk_policy, e.backend)
      return { result: typeof report === 'string' ? report : JSON.stringify(report, null, 2) }
    } catch (error) {
      return unavailable(error instanceof Error ? error.message : String(error))
    }
  }).catch(($, e, next) => unavailable(`the hook failed (${next.error.kind}): ${next.error.message}`))
}

function unavailable(reason: string) {
  return { result: 'Risk assessment unavailable: ' + reason }
}

export async function assess($, base: unknown, options, config, proposed?: unknown, context?: unknown, testingPolicy?: unknown, executionContext?: unknown, riskExperiment?: unknown, riskPolicy?: unknown, requestedBackend?: unknown) {
  if (!isSafeRef(base)) throw new Error('`base` must be a branch name, such as main')
  const keys = await backendKeys($, options)
  const chosen = chooseBackends(options, requestedBackend, keys, 'dev-kit')
  if (chosen === 'choose') return choiceNeeded('mcp__dev-kit__pr_risk')

  const cwd = await repoRoot($)
  const ref = await resolveBase($, cwd, base)
  const range = `${ref}...HEAD`
  const [commits, numstat, nameStatus] = await Promise.all([
    git($, cwd, ['log', '--no-color', '--format=%h %s%n%b', `${ref}..HEAD`]),
    // --no-relative: a user's diff.relative=true would limit the diff to the current directory.
    git($, cwd, ['diff', '--no-relative', '--numstat', '-z', '--no-renames', range]),
    git($, cwd, ['diff', '--no-relative', '--name-status', '-z', '-M', range]),
  ])

  const entries = numstat.split('\0').filter(Boolean).map((line) => {
    const [added, deleted, ...path] = line.split('\t')
    return { path: path.join('\t'), binary: added === '-', added: Number(added) || 0, deleted: Number(deleted) || 0 }
  })
  if (!entries.length) throw new Error(`no changes between ${ref} and HEAD`)

  const isReviewable = (f: { path: string; binary: boolean }) => !f.binary && !isExcluded(f.path)
  const excluded = entries.filter((f) => !isReviewable(f)).map((f) => f.path)
  const reviewable = entries.filter(isReviewable).map((f) => f.path)

  if (!reviewable.length) throw new Error('no reviewable text files in the change')
  let evidence: ExecutionEvidence = []
  if (executionContext !== undefined) {
    const [head, baseCommit] = await Promise.all([git($, cwd, ['rev-parse', 'HEAD^{commit}']), git($, cwd, ['rev-parse', `${ref}^{commit}`])])
    evidence = validateEvidence(executionContext, reviewable, [head.trim(), baseCommit.trim()].filter((r) => /^[0-9a-f]{40,64}$/i.test(r)))
    for (const entry of evidence) for (const source of entry.sources) {
      const content = await git($, cwd, ['show', `${source.ref}:${source.path}`])
      if ((source.symbol && !content.includes(source.symbol)) || source.facts.some((fact) => !content.includes(fact))) throw new Error(`execution_context excerpt not found in ${source.path} at ${source.ref}`)
    }
  }
  const policyName = riskPolicy ?? options?.risk_policy ?? 'calibrated-v1'
  if (policyName !== 'calibrated-v1' && policyName !== 'evidence-v1') throw new Error('unsupported risk_policy')
  const experiment = riskExperiment ?? options?.risk_experiment
  if (experiment !== undefined && experiment !== 'atomic-v1') throw new Error('unsupported risk_experiment')
  const budget = STATE_CHAR_BUDGET - (evidence.length ? EVIDENCE_BUDGET : 0)
  const { files, unread, clipped } = await readDiffs($, cwd, range, reviewable, budget)

  const statuses = fileStatuses(nameStatus, entries)
  await markMajorBumps($, cwd, ref, statuses)
  const clippedCommits = clipCommits(commits.trim())
  const slicing = await sliceChange($, proposed, clippedCommits, files, entries)
  const plan = slicing.slices ? splitSlices(slicing.slices, files, budget) : split(files, budget)
  const parts = plan.parts.length
    ? plan.parts
    : [{ files: [], diff: '(no reviewable text diff: only lockfiles, binary or generated files changed)' }]

  // The placeholder part belongs to no slice, so without any diff text the change is assessed as one.
  const slices = plan.parts.length ? (slicing.slices ?? []) : []
  const cleanedContext = typeof context === 'string' ? stripTrailingRisk(context.trim()).trim() : ''
  const purpose = { context: cleanedContext || undefined, commits: clippedCommits }
  const tests = testsInChange(parts.flatMap((p) => p.files))
  const typesafe = { url: endpointUrl(options?.typesafe_endpoint), model: trimmedOption(options?.typesafe_model, DEFAULT_MODEL) }

  const run = async (name: BackendName) => {
    // Each backend gets its own cap: their rate limits are separate.
    const request: JevRequest = { backend: backendFor(name, keys[name], typesafe), questions: questions(), limit: limiter(CONCURRENCY) }
    const [{ results, truncatedHunks, truncatedCodeHunks }, intents] = await Promise.all([
      requestParts($, request, parts, slices, evidence, experiment === 'atomic-v1', tests),
      requestIntents($, request, groupsOf(slices, reviewable), statuses, purpose),
    ])

    const policy = typeof testingPolicy === 'string' ? testingPolicy.trim() : ''
    const flagged = policy ? untestedGroups(results, intents, config, slices, reviewable, statuses) : []
    const testsNotRequired = await requestPolicy($, request, flagged, statuses, testPaths(reviewable), policy)
    const notAssessed = [...plan.skippedFiles, ...unread]
    const factorsMissing = results.filter((r) => r.factors === 'failed').length
    const codeMissing = notAssessed.length > 0 || plan.truncatedCodeHunks + truncatedCodeHunks > 0
    const partial = codeMissing || factorsMissing > 0
    const twoAxis = aggregate(results, intents, config, slices, reviewable, statuses, testsNotRequired, !codeMissing, policyName)
    const groups = results.flatMap((r) => (r.factors && r.factors !== 'failed' && r.factors !== 'documentation' ? [r.factors] : []))
    // With every factor request failed the two-axis level stands, so the PR is not cleared by an outage.
    const missing = new Set(results.flatMap((r) => (r.factors === 'failed' ? [r.slice ?? 0] : [])))
    const report = factorsMissing && !groups.length
      ? { ...twoAxis, scorer: 'two-axis fallback' }
      : factorReport(twoAxis, scoreFactors(groups, { slices, files: reviewable, statuses, testsNotRequired, context: cleanedContext }), config.levels, (level) => labelFor(config.labelTemplate, level), missing)
    const experimental = experiment === 'atomic-v1' ? {
      version: 'atomic-v1',
      status: results.some((r) => Object.values(r.experimentalAnswers ?? {}).some((a) => a.status === 'missing')) ? 'incomplete' : 'complete',
      signals: results.map((r) => ({ slice: r.slice, files: r.experimentalFiles, answers: r.experimentalAnswers })),
    } : undefined
    return {
      backend: name,
      ...report,
      riskPolicy: policyName,
      ...(experimental ? { experimental } : {}),
      base: ref,
      lowConfidence: partial || report.confidence < LOW_CONFIDENCE,
      slicing: { source: slicing.source, ...(slicing.reason ? { reason: slicing.reason } : {}) },
      coverage: {
        requests: results.length,
        filesAssessed: reviewable.length - notAssessed.length,
        filesNotAssessed: notAssessed.length,
        filesNotAssessedSample: notAssessed.slice(0, NOT_ASSESSED_SAMPLE),
        filesExcluded: excluded.length,
        truncatedHunks: clipped + plan.truncatedHunks + truncatedHunks,
        factorsMissing,
        partial,
      },
    }
  }

  if (chosen.length === 1) return run(chosen[0])
  const settled = await Promise.allSettled(chosen.map(run))
  const comparison = settled.map((s, i) => (s.status === 'fulfilled' ? summary(s.value) : { backend: chosen[i], error: s.reason instanceof Error ? s.reason.message : String(s.reason) }))
  await logComparison($, cwd, ref, comparison)
  const answered = settled.find((s) => s.status === 'fulfilled')
  if (!answered) throw new Error(comparison.map((c) => `${label(c.backend)}: ${'error' in c ? c.error : ''}`).join('; '))
  return { ...answered.value, comparison }
}

function summary(r) {
  return {
    backend: r.backend,
    model: r.model,
    level: r.level,
    impact: r.impact?.level,
    likelihood: r.likelihood?.level,
    complexity: r.complexity,
    confidence: r.confidence,
    lowConfidence: r.lowConfidence,
    scorer: r.scorer,
    slices: (r.slices ?? []).map((s) => ({ title: s.title, level: s.level, impact: s.impact?.level ?? s.impact, complexity: s.complexity })),
  }
}

// The log keeps every pair, so agreement between the backends can be measured later; it holds no diff text.
async function logComparison($, cwd: string, ref: string, comparison: Record<string, unknown>[]) {
  const home = trimmedOption(await $.env.get('HOME'), '')
  if (!home) return
  try {
    const [head, branch] = await Promise.all([git($, cwd, ['rev-parse', 'HEAD']), git($, cwd, ['branch', '--show-current'])])
    const entry = { at: new Date().toISOString(), repo: cwd.split('/').pop(), branch: branch.trim(), head: head.trim(), base: ref, results: comparison }
    await appendLine($, `${home}/${COMPARE_LOG}`, JSON.stringify(entry))
  } catch {
    // A log that cannot be written never costs the user their assessment.
  }
}

type Slicing = { source: 'caller' | 'model' | 'size'; slices?: Slice[]; reason?: string }

// The caller's grouping wins; otherwise a small model groups the files, and without one the diff is packed by size.
async function sliceChange(
  $,
  proposed: unknown,
  commits: string,
  files: FileDiff[],
  entries: { path: string; added: number; deleted: number }[],
): Promise<Slicing> {
  const paths = files.map((f) => f.path)
  if (!paths.length) return { source: 'size' }
  if (Array.isArray(proposed) && proposed.length) return { source: 'caller', slices: assignSlices(proposed, paths) }

  const counts = new Map(entries.map((e) => [e.path, e]))
  const prompt = slicingPrompt(
    commits,
    files.map((f) => ({ path: f.path, added: counts.get(f.path)?.added ?? 0, deleted: counts.get(f.path)?.deleted ?? 0, text: f.text })),
  )
  try {
    const r = await $.model.complete({ model: SLICING_MODEL, system: SLICING_SYSTEM, prompt, maxTokens: 4096, timeoutMs: 60_000 })
    if (!r.isAnswered) return { source: 'size', reason: `slicing model did not answer: ${r.reason}` }
    const slices = parseSlices(r.text, paths)
    if (!slices) return { source: 'size', reason: 'slicing model replied without valid JSON' }
    return { source: 'model', slices: assignSlices(slices, paths) }
  } catch (error) {
    return { source: 'size', reason: `slicing model refused: ${error instanceof Error ? error.message : String(error)}` }
  }
}

// The session's working directory follows the model's `cd`, which can leave the repository for a scratchpad or a
// work dir, so fall back to the directory the session started in.
async function repoRoot($): Promise<string> {
  const here = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { timeoutMs: 60_000 })
  if (here.exitCode === 0) return here.stdout.trim()
  const root = await $.session.root()
  const started = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd: root, timeoutMs: 60_000 })
  if (started.exitCode === 0) return started.stdout.trim()
  throw new Error(`neither the session's working directory (${await $.session.cwd()}) nor the directory it started in (${root}) is in a git repository`)
}

async function resolveBase($, cwd: string, base: string): Promise<string> {
  // origin first: the PR merges into the remote branch, and a stale local copy would widen the range.
  for (const ref of [`origin/${base}`, base]) {
    const r = await $.process.run(['git', 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd })
    if (r.exitCode === 0) return ref
  }
  throw new Error(`base branch "${base}" not found locally or on origin; run git fetch origin`)
}

async function readDiffs($, cwd: string, range: string, paths: string[], budget: number): Promise<{ files: FileDiff[]; unread: string[]; clipped: number }> {
  const files: FileDiff[] = []
  const unread: string[] = []
  let charsRead = 0
  let clipped = 0
  // Stop reading once the diff cannot fit in MAX_PARTS requests; the rest is reported as not assessed.
  for (const path of paths) {
    if (charsRead > budget * MAX_PARTS) {
      unread.push(path)
      continue
    }
    const diff = await git($, cwd, ['diff', '--no-relative', '-U1', '--no-color', '--no-ext-diff', '--no-renames', range, '--', `:(top,literal)${path}`])
    const bulk = clipBulk(path, diff.trimEnd(), budget)
    if (bulk.clipped) clipped += 1
    charsRead += bulk.text.length
    files.push({ path, text: bulk.text })
  }
  return { files, unread, clipped }
}

// Whole files, not diff lines: a lock-file hunk can show a version without the provider block it belongs to.
async function markMajorBumps($, cwd: string, ref: string, statuses: Map<string, FileStatus>) {
  const manifests = [...statuses].filter(([path, s]) => s.status === 'modified' && isDependencyManifest(path))
  if (!manifests.length) return
  const base = (await git($, cwd, ['merge-base', ref, 'HEAD'])).trim()
  for (const [path, status] of manifests) {
    const [before, after] = await Promise.all([git($, cwd, ['show', `${base}:${path}`]), git($, cwd, ['show', `HEAD:${path}`])])
    const bumps = majorBumps(path, before, after)
    if (bumps.length) status.majorBumps = bumps
  }
}

type ExtendedPartResult = PartResult & {
  experimentalFiles?: string[]
  experimentalAnswers?: ReturnType<typeof experimentalAnswers>
  factors?: FactorGroup | 'documentation' | 'failed'
}

type JevRequest = { backend: Backend; questions: Record<string, unknown>; limit: Limit }
type Limit = <T>(fn: () => Promise<T>) => Promise<T>

// The diff, factor, intent and policy pools nest and run side by side, so only a cap shared by every request holds
// Jev to CONCURRENCY in flight.
function limiter(size: number): Limit {
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

async function requestParts(
  $,
  request: JevRequest,
  parts: { files: string[]; diff: string; slice?: number }[],
  slices: Slice[],
  evidence: ExecutionEvidence,
  experiment: boolean,
  tests: string[],
): Promise<{ results: ExtendedPartResult[]; truncatedHunks: number; truncatedCodeHunks: number }> {
  let truncatedHunks = 0
  let truncatedCodeHunks = 0
  const ask = async (part: { files: string[]; diff: string; slice?: number }, depth: number): Promise<ExtendedPartResult[]> => {
    const relevantEvidence = evidenceForFiles(evidence, part.files)
    const state = { ...partState(part, part.slice === undefined ? undefined : slices[part.slice].title), ...(relevantEvidence.length ? { execution_context: relevantEvidence } : {}) }
    const body = JSON.stringify({ model: request.backend.model, state, questions: experiment ? { ...request.questions, ...atomicQuestions() } : request.questions })
    const res = await send($, request, body)
    if (!res.ok) {
      if (depth < MAX_SPLIT_DEPTH && tooLong(request.backend, res)) {
        const halves = halve(part)
        if (halves.parts.some((h) => h.diff.length < part.diff.length)) {
          truncatedHunks += halves.truncatedHunks
          truncatedCodeHunks += halves.truncatedCodeHunks
          const answered: ExtendedPartResult[] = []
          for (const h of halves.parts) answered.push(...(await ask({ ...h, slice: part.slice }, depth + 1)))
          return answered
        }
      }
      throw new Error(httpError(request.backend, res.status, res.text))
    }
    const data = JSON.parse(res.text)
    const answers = data.answers ?? {}
    const missing = missingAnswer(answers)
    if (missing) throw new Error(`${label(request.backend.name)} returned no numeric answer for "${missing}" (slice ${part.slice === undefined ? '-' : part.slice + 1})`)
    const signals = experiment ? experimentalAnswers(answers) : undefined
    // After the diff request, on the state that fitted: a part halved for length gets factor answers per half.
    const factors = await requestFactors($, request, state, tests, part.slice)
    return [{
      model: data.model,
      answers,
      slice: part.slice,
      factors,
      ...(experiment ? { experimentalFiles: part.files, experimentalAnswers: signals } : {}),
    }]
  }
  const results = (await pool(parts, CONCURRENCY, (part) => ask(part, 0))).flat()
  return { results, truncatedHunks, truncatedCodeHunks }
}

// Each repeat is the factor request plus, for a part with code, the testability request. A failed request drops only
// its own answers, and the part counts as missing when no repeat answered.
async function requestFactors($, request: JevRequest, state: { slice?: string; files: string[]; diff: string }, tests: string[], slice?: number): Promise<FactorGroup | 'documentation' | 'failed'> {
  const built = factorBodies(request.backend.model, state, tests)
  if (!built) return 'documentation'
  const { testOnly, bodies } = built
  const repeats = await Promise.all(Array.from({ length: FACTOR_REPEATS }, async () => {
    const settled = await Promise.allSettled(bodies.map(async (body) => JSON.parse((await post($, request, body)).text).answers ?? {}))
    const answered = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []))
    return answered.length ? Object.assign({}, ...answered) : undefined
  }))
  const answered = repeats.filter((r) => r !== undefined)
  return (answered.length && factorGroup(averageAnswers(answered), testOnly, slice)) || 'failed'
}

// One request per slice, beside the diff requests: the purpose and file statistics are small, so a slice never needs two.
async function requestIntents(
  $,
  request: JevRequest,
  groups: { title?: string; files: string[] }[],
  statuses,
  purpose: { context?: string; commits: string },
): Promise<IntentResult[]> {
  const questions = intentQuestions()
  return pool(groups, CONCURRENCY, async (group, i) => {
    const others = groups.flatMap((g, j) => (j !== i && g.title ? [g.title] : []))
    const body = JSON.stringify({ model: request.backend.model, state: intentState(group, statuses, purpose, others), questions })
    const res = await post($, request, body)
    const answers = JSON.parse(res.text).answers ?? {}
    const missing = missingIntent(answers)
    if (missing) throw new Error(`${label(request.backend.name)} returned no numeric answer for "${missing}" (slice ${i + 1} of ${groups.length})`)
    return { answers, group: i }
  })
}

// A failed policy request keeps the flag: the code's own rule already found logic without a test.
async function requestPolicy(
  $,
  request: JevRequest,
  flagged: { group: number; title?: string; files: string[]; types: string[] }[],
  statuses,
  tests: string[],
  policy: string,
): Promise<Set<number>> {
  const questions = policyQuestions()
  const cleared = await pool(flagged, CONCURRENCY, async (g) => {
    const body = JSON.stringify({ model: request.backend.model, state: policyState(g, statuses, g.types, tests, policy), questions })
    try {
      const res = await post($, request, body)
      return testsNeeded(JSON.parse(res.text).answers ?? {}) ? undefined : g.group
    } catch {
      return undefined
    }
  })
  return new Set(cleared.filter((g): g is number => g !== undefined))
}

async function post($, request: JevRequest, body: string) {
  const res = await send($, request, body)
  if (!res.ok) throw new Error(httpError(request.backend, res.status, res.text))
  return res
}

async function send($, request: JevRequest, body: string) {
  for (let attempt = 1; ; attempt++) {
    const res = await request.limit(() => $.http.fetch(request.backend.url, requestInit(request.backend, body)))
    if (res.ok || !RETRYABLE.has(res.status) || attempt === MAX_ATTEMPTS) return readResponse(request.backend, res)
    await $.clock.sleep(retryDelay(res.headers, attempt))
  }
}

async function git($, cwd: string, args: string[]): Promise<string> {
  const r = await $.process.run(['git', ...args], { cwd, timeoutMs: 60_000 })
  if (r.exitCode !== 0) throw new Error(`git ${args[0]} failed: ${r.stderr.trim().slice(0, 300)}`)
  return r.stdout
}
