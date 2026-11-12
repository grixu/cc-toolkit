import { DecisionError, ask, limiter, type Answers, type DecisionProvider, type Limit } from './decision.ts'
import {
  CONCURRENCY,
  DIFFSTAT_CHAR_BUDGET,
  MAX_SPLIT_DEPTH,
  STATE_CHAR_BUDGET,
  clip,
  git,
  halve,
  isExcluded,
  isSafeRef,
  pool,
  readDiffs,
  repoRoot,
  resolveBase,
  split,
  trimmedOption,
  type Part,
} from './jev.ts'
import { MODES, appendLine, chooseBackends, choiceNeeded, createProvider, hasAnyKey, providerKeys, type ProviderName } from './providers/index.ts'
import { aggregate, factQuestions, missingFact, partState } from './signals.ts'

const TOOL = 'proof_signals'
// The diffstat travels in every part, so the diff gets what is left of the state.
const DIFF_CHAR_BUDGET = STATE_CHAR_BUDGET - DIFFSTAT_CHAR_BUDGET
const DESCRIPTION =
  "Ask a decision model, TypeSafe Jev or Gemini Decision, which kinds of proof a branch's change needs. Sends the diffstat and diff of <base>...HEAD, without lockfiles and generated files, and returns JSON: for screenshots, video, api and terminal a signal (suggest, reject or uncertain) with its probability, whether the change affects program behaviour at all and whether that suppresses the others, the backend and model that answered, and how much of the diff was assessed. With both backends, `comparison` holds every backend's signals. Call it when planning proof for a pull request."
const COMPARE_LOG = '.cache/pr-proof/compare.jsonl'

export function register(on, options) {
  on('session.start', async ($, e, next) => {
    // Without a key nothing may leave the machine, so the tool does not exist at all.
    if (hasAnyKey(await providerKeys($, options))) {
      try {
        await $.tool.register({
          name: TOOL,
          description: DESCRIPTION,
          inputSchema: {
            type: 'object',
            properties: {
              base: { type: 'string', description: 'The branch the change merges into, such as main' },
              backend: {
                type: 'string',
                enum: [...MODES],
                description: 'Optional. The decision backend the user chose: typesafe, gemini or both. Pass it only with the user\'s answer after a "Backend choice needed" result.',
              },
            },
            required: ['base'],
          },
        })
      } catch {
        // A refused registration leaves the session without the tool, and prepare-proof judges from the diff alone.
      }
    }
    return next(e)
  })

  on('tool.call', { tool: `mcp__pr-proof__${TOOL}` }, async ($, e) => {
    try {
      const out = await proofSignals($, e.base, e.backend, options)
      return { result: typeof out === 'string' ? out : JSON.stringify(out, null, 2) }
    } catch (error) {
      return unavailable(error instanceof Error ? error.message : String(error))
    }
  }).catch(($, e, next) => unavailable(`the hook failed (${next.error.kind}): ${next.error.message}`))
}

function unavailable(reason: string) {
  return { result: 'Proof signals unavailable: ' + reason }
}

async function proofSignals($, base: unknown, requested: unknown, options) {
  if (!isSafeRef(base)) throw new Error('`base` must be a branch name, such as main')
  const keys = await providerKeys($, options)
  const chosen = chooseBackends(options, requested, keys, 'pr-proof')
  if (chosen === 'choose') return choiceNeeded(`mcp__pr-proof__${TOOL}`)

  const cwd = await repoRoot($)
  const ref = await resolveBase($, cwd, base)
  const range = `${ref}...HEAD`
  // --no-relative: a user's diff.relative=true would limit the diff to the current directory.
  const [diffstat, numstat] = await Promise.all([
    git($, cwd, ['diff', '--no-relative', '--stat=200', '--no-color', range]),
    git($, cwd, ['diff', '--no-relative', '--numstat', '-z', '--no-renames', range]),
  ])

  const entries = changedEntries(numstat)
  if (!entries.length) throw new Error(`no changes between ${ref} and HEAD`)
  const reviewable = entries.filter((f) => !f.binary && !isExcluded(f.path)).map((f) => f.path)
  const filesExcluded = entries.length - reviewable.length
  if (!reviewable.length) throw new Error('no reviewable text files in the change')

  const { files, unread } = await readDiffs($, cwd, range, reviewable, DIFF_CHAR_BUDGET)
  const plan = split(files, DIFF_CHAR_BUDGET)
  if (!plan.parts.length) throw new Error('no reviewable text diff: only mode changes or empty files')

  const context = { diffstat: clip(diffstat.trimEnd(), DIFFSTAT_CHAR_BUDGET) }
  const coverage = (parts: number, truncatedHunks: number) => {
    const filesNotAssessed = plan.skippedFiles.length + unread.length
    return { parts, filesNotAssessed, filesExcluded, truncatedHunks, partial: filesNotAssessed > 0 || truncatedHunks > 0 }
  }
  const run = async (name: ProviderName) => {
    // Each provider gets its own cap: their rate limits are separate.
    const asking: Asking = { provider: createProvider(name, keys, options), limit: limiter(CONCURRENCY) }
    const asked = await pool(plan.parts, CONCURRENCY, (part) => askPart($, asking, context, part, 0))
    const results = asked.flatMap((a) => a.answered)
    const truncatedHunks = asked.reduce((sum, a) => sum + a.truncatedHunks, plan.truncatedHunks)
    return { backend: name, model: results[0].model, ...aggregate(results.map((r) => r.answers)), coverage: coverage(results.length, truncatedHunks) }
  }

  if (chosen.length === 1) return run(chosen[0])
  const settled = await Promise.allSettled(chosen.map(run))
  const comparison = settled.map((s, i) =>
    s.status === 'fulfilled' ? s.value : { backend: chosen[i], error: s.reason instanceof Error ? s.reason.message : String(s.reason) },
  )
  await logComparison($, cwd, ref, comparison)
  const answered = settled.find((s) => s.status === 'fulfilled')
  if (!answered) throw new Error(comparison.map((c) => `${c.backend}: ${'error' in c ? c.error : ''}`).join('; '))
  return { ...answered.value, comparison }
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
    // A log that cannot be written never costs the user their signals.
  }
}

function changedEntries(numstat: string): { path: string; binary: boolean }[] {
  return numstat.split('\0').filter(Boolean).map((line) => {
    const [added, , ...path] = line.split('\t')
    return { path: path.join('\t'), binary: added === '-' }
  })
}

type Asking = { provider: DecisionProvider; limit: Limit }
type Answered = { model: string; answers: Answers }

async function askPart(
  $,
  asking: Asking,
  context: { diffstat: string },
  part: Part,
  depth: number,
): Promise<{ answered: Answered[]; truncatedHunks: number }> {
  let response
  try {
    response = await ask($, asking.provider, { input: partState(part, context), questions: factQuestions() }, asking.limit)
  } catch (error) {
    if (!(error instanceof DecisionError && error.kind === 'too_long' && depth < MAX_SPLIT_DEPTH)) throw error
    const halves = halve(part)
    if (!halves.parts.some((h) => h.diff.length < part.diff.length)) throw error
    const answered: Answered[] = []
    let truncatedHunks = halves.truncatedHunks
    for (const h of halves.parts) {
      const sub = await askPart($, asking, context, h, depth + 1)
      answered.push(...sub.answered)
      truncatedHunks += sub.truncatedHunks
    }
    return { answered, truncatedHunks }
  }
  const missing = missingFact(response.answers)
  if (missing) throw new Error(`${asking.provider.label} returned no numeric answer for "${missing}"`)
  return { answered: [{ model: response.model, answers: response.answers }], truncatedHunks: 0 }
}
