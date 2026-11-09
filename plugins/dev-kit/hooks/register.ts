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
  httpError,
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
const DESCRIPTION =
  'Assess the risk a branch introduces, with the TypeSafe Jev model. Groups the changed files of <base>...HEAD into vertical slices, sends each slice\'s diff to TypeSafe and, separately, the change\'s purpose with each slice\'s file statistics, and returns JSON: for the change and for each slice, the risk level with the impact of a mistake, its complexity and likelihood, the manual evidence it needs and whether the description carries it, any rule that adjusted them, what the change does (adds, changes, fixes, restructures), the types of change, and risk flags; plus confidence, the GitHub label to apply, and how much of the diff was assessed. Call it when preparing or reviewing a pull request.'

export function register(on, options) {
  const config = readConfig(options)

  on('session.start', async ($, e, next) => {
    // Without a key nothing may leave the machine, so the tool does not exist at all.
    if (await apiKey($, options)) {
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
      const report = await assess($, e.base, options, config, e.slices, e.context, e.testing_policy, e.execution_context, e.risk_experiment, e.risk_policy)
      return { result: JSON.stringify(report, null, 2) }
    } catch (error) {
      return unavailable(error instanceof Error ? error.message : String(error))
    }
  }).catch(($, e, next) => unavailable(`the hook failed (${next.error.kind}): ${next.error.message}`))
}

function unavailable(reason: string) {
  return { result: 'Risk assessment unavailable: ' + reason }
}

async function apiKey($, options): Promise<string> {
  return trimmedOption(options?.typesafe_api_key, '') || trimmedOption(await $.env.get('TYPESAFE_API_KEY'), '')
}

export async function assess($, base: unknown, options, config, proposed?: unknown, context?: unknown, testingPolicy?: unknown, executionContext?: unknown, riskExperiment?: unknown, riskPolicy?: unknown) {
  if (!isSafeRef(base)) throw new Error('`base` must be a branch name, such as main')
  const key = await apiKey($, options)
  if (!key) throw new Error('no TypeSafe API key; set TYPESAFE_API_KEY or the dev-kit option typesafe_api_key')

  const ref = await resolveBase($, base)
  const range = `${ref}...HEAD`
  const [commits, numstat, nameStatus] = await Promise.all([
    git($, ['log', '--no-color', '--format=%h %s%n%b', `${ref}..HEAD`]),
    git($, ['diff', '--numstat', '-z', '--no-renames', range]),
    git($, ['diff', '--name-status', '-z', '-M', range]),
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
    const [head, baseCommit] = await Promise.all([git($, ['rev-parse', 'HEAD^{commit}']), git($, ['rev-parse', `${ref}^{commit}`])])
    evidence = validateEvidence(executionContext, reviewable, [head.trim(), baseCommit.trim()].filter((r) => /^[0-9a-f]{40,64}$/i.test(r)))
    for (const entry of evidence) for (const source of entry.sources) {
      const content = await git($, ['show', `${source.ref}:${source.path}`])
      if ((source.symbol && !content.includes(source.symbol)) || source.facts.some((fact) => !content.includes(fact))) throw new Error(`execution_context excerpt not found in ${source.path} at ${source.ref}`)
    }
  }
  const policyName = riskPolicy ?? options?.risk_policy ?? 'calibrated-v1'
  if (policyName !== 'calibrated-v1' && policyName !== 'evidence-v1') throw new Error('unsupported risk_policy')
  const experiment = riskExperiment ?? options?.risk_experiment
  if (experiment !== undefined && experiment !== 'atomic-v1') throw new Error('unsupported risk_experiment')
  const budget = STATE_CHAR_BUDGET - (evidence.length ? EVIDENCE_BUDGET : 0)
  const { files, unread, clipped } = await readDiffs($, range, reviewable, budget)

  const statuses = fileStatuses(nameStatus, entries)
  await markMajorBumps($, ref, statuses)
  const clippedCommits = clipCommits(commits.trim())
  const slicing = await sliceChange($, proposed, clippedCommits, files, entries)
  const plan = slicing.slices ? splitSlices(slicing.slices, files, budget) : split(files, budget)
  const parts = plan.parts.length
    ? plan.parts
    : [{ files: [], diff: '(no reviewable text diff: only lockfiles, binary or generated files changed)' }]

  const request: JevRequest = {
    url: endpointUrl(options?.typesafe_endpoint),
    model: trimmedOption(options?.typesafe_model, DEFAULT_MODEL),
    key,
    questions: questions(),
    limit: limiter(CONCURRENCY),
  }
  const slices = slicing.slices ?? []
  const cleanedContext = typeof context === 'string' ? stripTrailingRisk(context.trim()).trim() : ''
  const purpose = { context: cleanedContext || undefined, commits: clippedCommits }
  const tests = testsInChange(parts.flatMap((p) => p.files))
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

async function resolveBase($, base: string): Promise<string> {
  // origin first: the PR merges into the remote branch, and a stale local copy would widen the range.
  for (const ref of [`origin/${base}`, base]) {
    const r = await $.process.run(['git', 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
    if (r.exitCode === 0) return ref
  }
  throw new Error(`base branch "${base}" not found locally or on origin; run git fetch origin`)
}

async function readDiffs($, range: string, paths: string[], budget: number): Promise<{ files: FileDiff[]; unread: string[]; clipped: number }> {
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
    const diff = await git($, ['diff', '-U1', '--no-color', '--no-ext-diff', '--no-renames', range, '--', `:(literal)${path}`])
    const bulk = clipBulk(path, diff.trimEnd(), budget)
    if (bulk.clipped) clipped += 1
    charsRead += bulk.text.length
    files.push({ path, text: bulk.text })
  }
  return { files, unread, clipped }
}

// Whole files, not diff lines: a lock-file hunk can show a version without the provider block it belongs to.
async function markMajorBumps($, ref: string, statuses: Map<string, FileStatus>) {
  const manifests = [...statuses].filter(([path, s]) => s.status === 'modified' && isDependencyManifest(path))
  if (!manifests.length) return
  const base = (await git($, ['merge-base', ref, 'HEAD'])).trim()
  for (const [path, status] of manifests) {
    const [before, after] = await Promise.all([git($, ['show', `${base}:${path}`]), git($, ['show', `HEAD:${path}`])])
    const bumps = majorBumps(path, before, after)
    if (bumps.length) status.majorBumps = bumps
  }
}

type ExtendedPartResult = PartResult & {
  experimentalFiles?: string[]
  experimentalAnswers?: ReturnType<typeof experimentalAnswers>
  factors?: FactorGroup | 'documentation' | 'failed'
}

type JevRequest = { url: string; model: string; key: string; questions: Record<string, unknown>; limit: Limit }
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
    const body = JSON.stringify({ model: request.model, state, questions: experiment ? { ...request.questions, ...atomicQuestions() } : request.questions })
    const res = await send($, request, body)
    if (!res.ok) {
      if (depth < MAX_SPLIT_DEPTH && tooLong(res)) {
        const halves = halve(part)
        if (halves.parts.some((h) => h.diff.length < part.diff.length)) {
          truncatedHunks += halves.truncatedHunks
          truncatedCodeHunks += halves.truncatedCodeHunks
          const answered: ExtendedPartResult[] = []
          for (const h of halves.parts) answered.push(...(await ask({ ...h, slice: part.slice }, depth + 1)))
          return answered
        }
      }
      throw new Error(httpError(res.status, res.text))
    }
    const data = JSON.parse(res.text)
    const answers = data.answers ?? {}
    const missing = missingAnswer(answers)
    if (missing) throw new Error(`TypeSafe returned no numeric answer for "${missing}" (slice ${part.slice === undefined ? '-' : part.slice + 1})`)
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
  const built = factorBodies(request.model, state, tests)
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

const tooLong = (res) => res.status === 400 && String(res.text).includes('max_tokens_exceeded')

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
    const body = JSON.stringify({ model: request.model, state: intentState(group, statuses, purpose, others), questions })
    const res = await post($, request, body)
    const answers = JSON.parse(res.text).answers ?? {}
    const missing = missingIntent(answers)
    if (missing) throw new Error(`TypeSafe returned no numeric answer for "${missing}" (slice ${i + 1} of ${groups.length})`)
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
    const body = JSON.stringify({ model: request.model, state: policyState(g, statuses, g.types, tests, policy), questions })
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
  if (!res.ok) throw new Error(httpError(res.status, res.text))
  return res
}

async function send($, request: JevRequest, body: string) {
  for (let attempt = 1; ; attempt++) {
    const res = await request.limit(() => $.http.fetch(request.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${request.key}`, 'content-type': 'application/json' },
      body,
    }))
    if (res.ok || !RETRYABLE.has(res.status) || attempt === MAX_ATTEMPTS) return res
    await $.clock.sleep(retryDelay(res.headers, attempt))
  }
}

async function git($, args: string[]): Promise<string> {
  const r = await $.process.run(['git', ...args], { timeoutMs: 60_000 })
  if (r.exitCode !== 0) throw new Error(`git ${args[0]} failed: ${r.stderr.trim().slice(0, 300)}`)
  return r.stdout
}
