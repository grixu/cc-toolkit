#!/usr/bin/env node
// Runs the pr_risk assessment against the real TypeSafe API on labelled pull requests.
//
//   node plugins/dev-kit/evals/pr-risk/run.mjs --tag baseline
//   node plugins/dev-kit/evals/pr-risk/run.mjs --tag slices --only 'auth|migration'
//   node plugins/dev-kit/evals/pr-risk/run.mjs --local owner/name=../name   # clone from a checkout
//   node plugins/dev-kit/evals/pr-risk/run.mjs --types slices.jsonl --repo owner/name --prs prs.jsonl
//   ... --variant presence     # character types asked as presence, to measure what dominance buys
//   ... --variant v2           # the earlier 31 diff-only questions, with no intent request
//   ... --variant causal-impact-v1 # experimental impact wording, no scoring changes
//   ... --diff-context         # also put the PR description in each diff request's state
//   ... --slicing-cache s.json # freeze the slicing model's replies, so an A/B run differs only in the tool
//   ... --testing-policies local/testing-policies.json  # each repository's testing rules, as the tool's testing_policy
//   ... --replay .results/pr-risk/<run>.json  # answer TypeSafe requests from a recorded run, offline, to measure scoring changes
//   ... --allow-legacy-slicing-cache  # explicitly freeze an old cache whose slicing prompts cannot be verified
//   ... --allow-legacy-replay   # permit old shape-only Jev traces; unsuitable for validating prompt changes
//   ... --execution-context local/evidence.json --risk-experiment atomic-v1
//   ... --sandbox <dir>        # clones and worktrees go here, so a replay can run beside a live eval
//
// Each dataset line: {"id", "repo": "owner/name", "base": "<sha>", "head": "<sha>",
// "level": "<expected level>", "impact"?: "<expected impact>", "likelihood"?: "<expected likelihood>",
// "flags": ["security", ...], "context"?, "note"}. Impact and likelihood are scored apart, to show which Score question
// moved a level.
// A --types line is one squash-merged PR with its slices labelled by change type and intent:
// {"pr", "sha", "slices": [{"title", "files", "types", "intents", "uncertain"?, "lockfile_only"?}]}; the slices are
// passed to the tool as given, so only the type and intent answers are measured. --prs lines {"pr", "title", "body"}
// become the tool's context.
// Reads TYPESAFE_API_KEY from the environment, unless replaying; results go to evals/.results/pr-risk/.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, matchesGlob, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { assess } from '../../hooks/register.ts'
import {
  CHARACTERS,
  FLAGS,
  IMPACT_LEVELS,
  intentQuestions,
  LIKELIHOOD_LEVELS,
  questions,
  readConfig,
  typeThreshold,
  typesProseCannotHave,
} from '../../hooks/risk.ts'
import { rewritePrompt, validateVariant } from './prompt-variants.mjs'
import { atomicQuestions, DEFAULT_MODEL } from '../../hooks/evidence.ts'
import { completionStatus, summarizeExperimental, summarizeMetrics } from './metrics.mjs'
import { cachedSlicing, consumeRecorded, hash, replayPayload, requestProvenance, slicingProvenance } from './replay.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const evals = resolve(here, '..')

const { values: args } = parseArgs({
  options: {
    // local/ holds cases from private repositories and is git-ignored; both files run when present
    dataset: { type: 'string', multiple: true, default: [join(here, 'dataset.jsonl'), join(here, 'local', 'dataset.jsonl')] },
    types: { type: 'string' },
    prs: { type: 'string' },
    variant: { type: 'string', default: 'dominance' },
    'diff-context': { type: 'boolean', default: false },
    // fetch each dataset case's PR title and body with gh, so private descriptions never land in the dataset
    'gh-context': { type: 'boolean', default: false },
    repo: { type: 'string' },
    tag: { type: 'string', default: 'run' },
    model: { type: 'string', default: DEFAULT_MODEL },
    only: { type: 'string' },
    // off answers the slicing model call as unanswered, so the diff is packed by size
    slicing: { type: 'string', default: 'model' },
    // replays each case's slicing reply from this file, writing the ones it lacks, so two runs compare the same slices
    'slicing-cache': { type: 'string' },
    // owner/name=/path clones from a local checkout instead of GitHub
    local: { type: 'string', multiple: true, default: [] },
    // {"owner/name": {"policy": "..."}} passed as each case's testing_policy; private, so it lives in local/
    'testing-policies': { type: 'string' },
    replay: { type: 'string', multiple: true, default: [] },
    'allow-legacy-replay': { type: 'boolean', default: false },
    'allow-legacy-slicing-cache': { type: 'boolean', default: false },
    // JSON object keyed by case id, containing the tool's execution_context arrays.
    'execution-context': { type: 'string' },
    'risk-experiment': { type: 'string' },
    'risk-policy': { type: 'string', default: 'calibrated-v1' },
    sandbox: { type: 'string', default: join(evals, '.sandbox', 'pr-risk') },
  },
})
const replaying = args.replay.length > 0
validateVariant(args.variant)
if (replaying && args['gh-context']) throw new Error('--gh-context cannot be used with --replay; store context in the dataset or --prs file')
const localSources = Object.fromEntries(args.local.map((m) => m.split('=')))
const testingPolicies = args['testing-policies'] ? JSON.parse(readFileSync(args['testing-policies'], 'utf8')) : {}
const executionContexts = args['execution-context'] ? JSON.parse(readFileSync(args['execution-context'], 'utf8')) : {}
if (args['risk-experiment'] && args['risk-experiment'] !== 'atomic-v1') throw new Error('--risk-experiment must be atomic-v1')
if (!['calibrated-v1', 'evidence-v1'].includes(args['risk-policy'])) throw new Error('--risk-policy must be calibrated-v1 or evidence-v1')

if (args.types && !args.repo) {
  console.error('--types needs --repo owner/name')
  process.exit(2)
}
if (!replaying && !process.env.TYPESAFE_API_KEY) {
  console.error('TYPESAFE_API_KEY is not set')
  process.exit(2)
}

const lines = (file) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))

const descriptions = new Map((args.prs ? lines(args.prs) : []).map((p) => [p.pr, `${p.title}\n\n${p.body ?? ''}`.trim()]))
const cases = (
  args.types
    ? lines(args.types).map((l) => ({
        id: `pr-${l.pr}`,
        repo: args.repo,
        parentOf: l.sha,
        head: l.sha,
        slices: l.slices,
        context: descriptions.get(l.pr),
      }))
    : args.dataset.filter(existsSync).flatMap(lines)
).filter((c) => !args.only || new RegExp(args.only).test(c.id))
const TYPE_KEYS = Object.keys(questions()).filter((k) => !k.startsWith('defect_'))
const INTENT_KEYS = Object.keys(intentQuestions())

const options = { decision_backend: 'typesafe', typesafe_model: args.model, risk_policy: args['risk-policy'], ...(args['risk-experiment'] && { risk_experiment: args['risk-experiment'] }) }
const config = readConfig(options)
const sandbox = resolve(args.sandbox)
const THRESHOLDS = [0.5, 0.6, 0.7, 0.8, 0.9]
// The tool trims slice titles to this length, and the eval matches its slices back by title.
const MAX_TITLE = 80

function run(argv, cwd) {
  const r = spawnSync(argv[0], argv.slice(1), { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  return { exitCode: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? String(r.error ?? '') }
}

function mustRun(argv, cwd) {
  const r = run(argv, cwd)
  if (r.exitCode !== 0) throw new Error(`${argv.join(' ')} failed: ${r.stderr.trim()}`)
  return r.stdout
}

function clone(repo) {
  const dir = join(sandbox, 'repos', repo.replace('/', '__'))
  if (!existsSync(dir)) {
    mkdirSync(dirname(dir), { recursive: true })
    const source = localSources[repo] ?? `git@github.com:${repo}.git`
    mustRun(['git', 'clone', '--bare', '--filter=blob:none', source, dir])
  }
  return dir
}

// A commit-only worktree: the assessment diffs commits and never reads the working tree.
function worktree(repoDir, c) {
  for (const sha of [c.base, c.head])
    if (run(['git', 'cat-file', '-e', `${sha}^{commit}`], repoDir).exitCode !== 0)
      mustRun(['git', 'fetch', '--filter=blob:none', 'origin', sha], repoDir)
  const dir = join(sandbox, 'work', c.id)
  rmSync(dir, { recursive: true, force: true })
  run(['git', 'worktree', 'prune'], repoDir)
  mustRun(['git', 'worktree', 'add', '--detach', '--no-checkout', dir, c.head], repoDir)
  return dir
}

const slicingCache = args['slicing-cache'] && existsSync(args['slicing-cache']) ? JSON.parse(readFileSync(args['slicing-cache'], 'utf8')) : {}

async function complete(req, slicingTrace, id, misses) {
  const provenance = slicingProvenance(req)
  let response
  let source
  try {
    if (args.slicing === 'off') {
      source = 'disabled'
      response = { isAnswered: false, reason: 'slicing off' }
    } else if (id in slicingCache) {
      source = slicingCache[id].requestHash ? 'cache' : 'legacy-cache'
      response = cachedSlicing(slicingCache[id], req, args['allow-legacy-slicing-cache'])
    } else if (replaying) {
      source = 'recording'
      const pool = recordedSlicing.get(id) ?? []
      const index = pool.findIndex((entry) => entry.requestHash === provenance.requestHash && entry.response)
      if (index < 0) throw new Error(`replay: no exact recorded slicing request (${provenance.requestHash})`)
      response = pool.splice(index, 1)[0].response
    } else {
      source = 'live'
      response = await completeLive(req, slicingTrace).catch((e) => ({ isAnswered: false, reason: String(e.message ?? e) }))
      if (args['slicing-cache']) {
        slicingCache[id] = { ...provenance, response }
        writeFileSync(args['slicing-cache'], JSON.stringify(slicingCache, null, 1))
      }
    }
  } catch (error) {
    // The tool deliberately falls back after slicing errors; replay integrity errors must still fail the case.
    misses.push(error.message)
    throw error
  } finally {
    slicingTrace.push({ ...provenance, source, response })
  }
  return response
}

// Stands in for $.model.complete: one turn, no tools, no project context, on the user's Claude Code login.
async function completeLive({ model, system, prompt }, slicingTrace) {
  const started = Date.now()
  let text = ''
  for await (const m of query({
    prompt,
    options: {
      model,
      systemPrompt: system,
      tools: [],
      maxTurns: 1,
      settingSources: [],
      persistSession: false,
      thinking: { type: 'disabled' },
    },
  })) {
    if (m.type === 'result') {
      text = m.subtype === 'success' ? m.result : ''
      slicingTrace.push({ ms: Date.now() - started, usage: m.usage, costUsd: m.total_cost_usd, reply: text })
    }
  }
  return text ? { isAnswered: true, text } : { isAnswered: false, reason: 'empty-reply' }
}

// Variants rewrite the request on its way out, so the tool under test stays the shipped code.
function rewrite(body, context) {
  return rewritePrompt(body, { variant: args.variant, characters: CHARACTERS, diffContext: args['diff-context'], context })
}

function zeros(qs) {
  return Object.fromEntries(Object.keys(qs).map((key) => [key, key.startsWith('defect_') ? { score: 0, confidence: 0 } : { noul: 0 }]))
}

// Each recorded answer is served once, so identical requests get their answers in recorded order.
const recorded = new Map()
const recordedSlicing = new Map()
for (const file of args.replay)
  for (const r of JSON.parse(readFileSync(file, 'utf8')).results) {
    recorded.set(r.id, [...(recorded.get(r.id) ?? []), ...r.trace.filter((t) => t.status === 200 && t.answers)])
    recordedSlicing.set(r.id, [...(recordedSlicing.get(r.id) ?? []), ...(r.slicingTrace ?? [])])
  }

function replayed(id, body, kind, slice) {
  const pool = recorded.get(id) ?? []
  const t = consumeRecorded(pool, body, kind, slice, args['allow-legacy-replay'])
  const response = new Response(JSON.stringify(replayPayload(t)), { status: 200 })
  response.replayMatch = t.requestHash ? 'sha256' : t.key ? 'sha1' : 'legacy-shape'
  return response
}

function shim(cwd, trace, slicingTrace, context, id, misses) {
  return {
    // assess refuses to run without a key; a replay never sends one
    env: { get: async (name) => (replaying && name === 'TYPESAFE_API_KEY' ? 'replay' : process.env[name]) },
    process: { run: async (argv) => run(argv, cwd) },
    model: { complete: (req) => complete(req, slicingTrace, id, misses) },
    clock: { sleep: (ms) => new Promise((r) => setTimeout(r, ms)) },
    http: {
      fetch: async (url, init) => {
        const started = Date.now()
        init = { ...init, body: rewrite(init.body, context) }
        const asked = JSON.parse(init.body)
        // v2 had no intent request, so it is answered locally with zeros and never reaches TypeSafe.
        if (args.variant === 'v2' && !('diff' in asked.state) && !('testing_policy' in asked.state))
          return { status: 200, ok: true, headers: {}, text: JSON.stringify({ answers: zeros(intentQuestions()) }) }
        const state = asked.state
        const kind = 'diff' in state ? 'diff' : 'testing_policy' in state ? 'policy' : 'intent'
        let res
        try {
          res = replaying ? replayed(id, init.body, kind, state.slice) : await fetch(url, init)
        } catch (e) {
          // The tool swallows a failed policy request, so a transport failure is also kept to fail the case.
          misses.push(e.message)
          trace.push({ ...requestProvenance(init.body), kind, slice: state.slice, status: null, error: e.message, ms: Date.now() - started })
          throw e
        }
        let text = await res.text()
        let data = {}
        try {
          data = JSON.parse(text)
        } catch {}
        // The tool insists on an answer for every current type; v2 asked other questions, so the rest read as no.
        if (args.variant === 'v2' && data.answers) text = JSON.stringify({ ...data, answers: { ...zeros(questions()), ...data.answers } })
        trace.push({
          ms: Date.now() - started,
          kind,
          status: res.status,
          bodyChars: init.body.length,
          ...requestProvenance(init.body),
          responseModel: data.model,
          ...(replaying && { replayMatch: res.replayMatch }),
          slice: state.slice,
          usage: data.usage,
          answers: data.answers,
        })
        return { status: res.status, ok: res.ok, headers: Object.fromEntries(res.headers), text }
      },
    },
  }
}

// The highest probability Jev gave each type and intent across a slice's requests; an intent the tool read from
// git counts as certain, and a type the tool rules out for a prose-only slice counts as absent.
function typeProbabilities(trace, title, reported) {
  const probs = {}
  for (const t of trace.filter((t) => t.slice === title && t.answers))
    for (const [key, a] of Object.entries(t.answers))
      if (typeof a.noul === 'number') probs[key] = Math.max(probs[key] ?? 0, a.noul)
  if (args.variant !== 'v2') {
    for (const key of reported?.intents ?? []) probs[key] = 1
    for (const key of typesProseCannotHave(reported?.files ?? [])) if (key in probs) probs[key] = 0
  }
  return probs
}

const levelIndex = (level) => config.levels.indexOf(level)
const results = []

// Dataset ids carry the PR number after the repo name, such as cc-toolkit-26-pr-open-with-jev.
function ghContext(c) {
  const pr = c.id.match(/-(\d+)(?:-|$)/)?.[1]
  if (!pr) return undefined
  const r = run(['gh', 'pr', 'view', pr, '-R', c.repo, '--json', 'title,body', '-q', '.title + "\n\n" + .body'])
  return r.exitCode === 0 ? r.stdout.trim() : undefined
}

for (const c of cases) {
  const trace = []
  const slicingTrace = []
  const misses = []
  const started = Date.now()
  const contextSource = c.context ? (args.types ? 'prs' : 'dataset') : args['gh-context'] ? 'github' : 'none'
  const policy = testingPolicies[c.repo]?.policy
  const executionContext = executionContexts[c.id] ?? c.execution_context
  let repoDir
  let cwd
  let report
  let error
  try {
    if (args['gh-context'] && !c.context) c.context = ghContext(c)
    repoDir = clone(c.repo)
    if (c.parentOf) c.base = mustRun(['git', 'rev-parse', `${c.parentOf}^`], repoDir).trim()
    // Labelled slices may list globs; the tool only takes paths, and drops any it does not know.
    if (c.slices) {
      const changed = mustRun(['git', 'diff', '--name-only', '--no-renames', '-z', c.base, c.head], repoDir).split('\0').filter(Boolean)
      for (const s of c.slices) s.files = changed.filter((p) => s.files.some((f) => f === p || matchesGlob(p, f)))
    }
    cwd = worktree(repoDir, c)
    const slices = c.slices?.map((s) => ({ title: s.title, files: s.files }))
    report = await assess(shim(cwd, trace, slicingTrace, c.context, c.id, misses), c.base, options, config, slices, c.context, policy, executionContext)
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  } finally {
    if (cwd) run(['git', 'worktree', 'remove', '--force', cwd], repoDir)
  }
  error ??= misses[0]
  // A retried request may recover. Only its final response determines whether a swallowed policy call failed.
  const finalRequests = [...new Map(trace.map((t) => [t.requestHash, t])).values()]
  const failedPolicy = finalRequests.find((t) => t.kind === 'policy' && (t.status < 200 || t.status >= 300 || !t.answers))
  if (failedPolicy) error ??= `policy request failed (${failedPolicy.status ?? 'transport error'})`
  const ms = Date.now() - started

  const predicted = report?.level
  const result = {
    id: c.id,
    provenance: {
      repo: c.repo, base: c.base, head: c.head,
      sliceInput: c.slices?.length ? 'caller' : 'fallback',
      sliceInputHash: c.slices ? hash(JSON.stringify(c.slices.map(({ title, files }) => ({ title, files })))) : null,
      slicingSource: report?.slicing?.source ?? null,
      context: { present: Boolean(c.context?.trim()), source: contextSource, hash: c.context ? hash(c.context) : null },
      executionContext: { present: executionContext != null, hash: executionContext == null ? null : hash(JSON.stringify(executionContext)) },
      testingPolicy: { present: Boolean(policy?.trim()), hash: policy ? hash(policy) : null },
    },
    model: report?.model,
    riskPolicy: report?.riskPolicy,
    complete: report?.complete,
    experimental: report?.experimental,
    expected: c.level,
    predicted,
    distance: predicted && c.level ? levelIndex(predicted) - levelIndex(c.level) : null,
    impact: report?.impact,
    expectedImpact: c.impact,
    impactDistance: scaleDistance(IMPACT_LEVELS, report?.impact?.level, c.impact),
    likelihood: report?.likelihood,
    expectedLikelihood: c.likelihood,
    likelihoodDistance: scaleDistance(LIKELIHOOD_LEVELS, report?.likelihood?.level, c.likelihood),
    adjustments: report?.adjustments,
    intents: report?.intents,
    confidence: report?.confidence,
    types: report?.types,
    expectedFlags: c.flags ?? [],
    flags: report?.flags.map((f) => f.key) ?? [],
    coverage: report?.coverage,
    slicing: report?.slicing,
    slices: report?.slices?.map((s) => ({
      title: s.title,
      files: s.files.length,
      level: s.level,
      impact: s.impact,
      likelihood: s.likelihood,
      adjustments: s.adjustments,
      intents: s.intents,
      types: s.types,
      flags: s.flags,
    })),
    typeSlices: c.slices
      ?.filter((s) => !s.lockfile_only)
      .map((s) => {
        const title = s.title.trim().slice(0, MAX_TITLE)
        const reported = report?.slices?.find((r) => r.title === title)
        const expected = [...(s.types ?? []), ...(s.intents ?? [])]
        return { title, expected, uncertain: s.uncertain ?? [], probabilities: typeProbabilities(trace, title, reported) }
      })
      .filter((s) => Object.keys(s.probabilities).length),
    slicingTrace,
    requests: trace.length,
    inputTokens: trace.reduce((n, t) => n + (t.usage?.input_tokens ?? 0), 0),
    ms,
    trace,
    error,
  }
  result.status = completionStatus(result, config.levels)
  results.push(result)
  const mark = error ? '!' : result.distance == null ? '·' : result.distance === 0 ? '=' : result.distance > 0 ? '+' : '-'
  console.log(
    `${mark} ${c.id.padEnd(32)} expected ${String(c.level ?? '-').padEnd(9)} got ${String(predicted ?? error).padEnd(9)}` +
      ` impact ${report?.impact?.level ?? '-'}/${c.impact ?? '-'} likelihood ${report?.likelihood?.level ?? '-'}/${c.likelihood ?? '-'}` +
      ` flags [${result.flags.join(',')}]` +
      ` req ${result.requests} tok ${result.inputTokens} ${ms}ms`,
  )
}

const ok = results.filter((r) => r.status === 'completed')
const leveled = ok.filter((r) => r.distance != null)
const metrics = summarizeMetrics(results, config.levels)
const flagStats = Object.fromEntries(
  Object.keys(FLAGS).map((key) => {
    const tp = leveled.filter((r) => r.flags.includes(key) && r.expectedFlags.includes(key)).length
    const fp = leveled.filter((r) => r.flags.includes(key) && !r.expectedFlags.includes(key)).length
    const fn = leveled.filter((r) => !r.flags.includes(key) && r.expectedFlags.includes(key)).length
    return [key, { tp, fp, fn }]
  }),
)

const typeSlices = ok.flatMap((r) => r.typeSlices ?? [])
function typeStats(threshold, keys = TYPE_KEYS) {
  const perType = Object.fromEntries(
    keys.map((key) => {
      const yes = (s) => (s.probabilities[key] ?? 0) >= (threshold === 'tool' ? typeThreshold(key) : threshold)
      const tp = typeSlices.filter((s) => yes(s) && s.expected.includes(key)).length
      const fp = typeSlices.filter((s) => yes(s) && !s.expected.includes(key)).length
      const fn = typeSlices.filter((s) => !yes(s) && s.expected.includes(key)).length
      const precision = tp + fp ? tp / (tp + fp) : null
      const recall = tp + fn ? tp / (tp + fn) : null
      return [key, { tp, fp, fn, precision: round(precision), recall: round(recall) }]
    }),
  )
  const sum = (f) => Object.values(perType).reduce((n, s) => n + s[f], 0)
  const tp = sum('tp')
  const fp = sum('fp')
  const fn = sum('fn')
  return { threshold, tp, fp, fn, precision: round(tp / (tp + fp)), recall: round(tp / (tp + fn)), perType }
}

function scaleDistance(levels, got, expected) {
  return got && expected ? levels.indexOf(got) - levels.indexOf(expected) : null
}

function scaleStats(field) {
  const scored = ok.filter((r) => r[field] != null)
  if (!scored.length) return undefined
  return {
    exact: scored.filter((r) => r[field] === 0).length,
    withinOne: scored.filter((r) => Math.abs(r[field]) <= 1).length,
    over: scored.filter((r) => r[field] > 0).length,
    under: scored.filter((r) => r[field] < 0).length,
  }
}

function round(n) {
  return n == null || Number.isNaN(n) ? null : Math.round(n * 100) / 100
}

const summary = {
  tag: args.tag,
  model: args.model,
  riskPolicy: args['risk-policy'],
  cases: results.length,
  errors: metrics.failed,
  metrics,
  experimental: summarizeExperimental(results, args['risk-experiment'], Object.keys(atomicQuestions()).filter((key) => !key.endsWith('_evidence_sufficient'))),
  evaluationScope: {
    workflow: 'assess',
    responses: replaying ? 'recorded' : 'live',
    callerSlices: results.filter((r) => r.provenance.sliceInput === 'caller').length,
    fallbackSlices: results.filter((r) => r.provenance.sliceInput === 'fallback').length,
    frozenSlicingCache: Boolean(args['slicing-cache']),
    contextPresent: results.filter((r) => r.provenance.context.present).length,
    executionContextPresent: results.filter((r) => r.provenance.executionContext.present).length,
  },
  provenance: {
    config,
    configHash: hash(JSON.stringify(config)),
    options,
    requestHashAlgorithm: 'sha256',
    replayMatching: args['allow-legacy-replay'] ? 'exact-or-explicit-legacy-shape' : 'exact-request-hash',
    allowLegacySlicingCache: args['allow-legacy-slicing-cache'],
    legacyReplayMatches: results.flatMap((r) => r.trace).filter((t) => t.replayMatch === 'legacy-shape').length,
    legacySlicingCacheUses: results.flatMap((r) => r.slicingTrace).filter((t) => t.source === 'legacy-cache').length,
    slicing: args.slicing,
    ghContext: args['gh-context'],
    only: args.only ?? null,
    slicingCacheHash: args['slicing-cache'] && existsSync(args['slicing-cache']) ? hash(readFileSync(args['slicing-cache'])) : null,
    sourceHashes: Object.fromEntries(['../../hooks/risk.ts', '../../hooks/register.ts', '../../hooks/evidence.ts', './run.mjs', './metrics.mjs', './replay.mjs', './v2-types.mjs', './prompt-variants.mjs']
      .map((path) => [path, hash(readFileSync(resolve(here, path)))])),
    datasetHashes: Object.fromEntries((args.types ? [args.types] : args.dataset.filter(existsSync)).map((path) => [path, hash(readFileSync(path))])),
  },
  exact: leveled.filter((r) => r.distance === 0).length,
  withinOne: leveled.filter((r) => Math.abs(r.distance) <= 1).length,
  over: leveled.filter((r) => r.distance > 0).length,
  under: leveled.filter((r) => r.distance < 0).length,
  meanAbsDistance: leveled.length ? leveled.reduce((n, r) => n + Math.abs(r.distance), 0) / leveled.length : null,
  impact: scaleStats('impactDistance'),
  likelihood: scaleStats('likelihoodDistance'),
  flags: flagStats,
  variant: args.variant,
  diffContext: args['diff-context'],
  ...(replaying && { replay: args.replay.length === 1 ? args.replay[0] : args.replay }),
  ...(typeSlices.length && {
    typeSlices: typeSlices.length,
    types: THRESHOLDS.map((t) => {
      const { perType, ...total } = typeStats(t)
      return total
    }),
    // the tool's own decision, with each type's threshold
    tool: (({ perType, ...total }) => total)(typeStats('tool')),
    intents: THRESHOLDS.map((t) => {
      const { perType, ...total } = typeStats(t, INTENT_KEYS)
      return total
    }),
  }),
  requests: results.reduce((n, r) => n + r.requests, 0),
  inputTokens: results.reduce((n, r) => n + r.inputTokens, 0),
  ms: results.reduce((n, r) => n + r.ms, 0),
}

console.log('\n' + JSON.stringify(summary, null, 2))
if (typeSlices.length)
  for (const [name, keys] of [['type', TYPE_KEYS], ['intent', INTENT_KEYS]]) {
    const { perType } = typeStats(name === 'type' ? 'tool' : 0.7, keys)
    console.log(`\nper ${name} at the tool's thresholds (tp fp fn precision recall):`)
    for (const [key, s] of Object.entries(perType).sort((a, b) => b[1].tp + b[1].fn - (a[1].tp + a[1].fn)))
      console.log(`  ${key.padEnd(30)} ${String(s.tp).padStart(3)} ${String(s.fp).padStart(3)} ${String(s.fn).padStart(3)}  ${s.precision ?? '-'}  ${s.recall ?? '-'}`)
  }
const out = join(evals, '.results', 'pr-risk')
mkdirSync(out, { recursive: true })
const file = join(out, `${new Date().toISOString().replace(/[:.]/g, '-')}-${args.tag}.json`)
writeFileSync(file, JSON.stringify({ summary, results }, null, 2))
console.log(`\nwrote ${file}`)
