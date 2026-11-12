import {
  CONCURRENCY,
  DIFFSTAT_CHAR_BUDGET,
  MAX_SPLIT_DEPTH,
  STATE_CHAR_BUDGET,
  clip,
  endpointUrl,
  git,
  halve,
  httpError,
  isExcluded,
  isSafeRef,
  limiter,
  pool,
  readDiffs,
  repoRoot,
  resolveBase,
  send,
  split,
  tooLong,
  trimmedOption,
  type JevRequest,
  type Part,
} from './jev.ts'
import { aggregate, factQuestions, missingFact, partState, type Answers } from './signals.ts'

const TOOL = 'proof_signals'
const DEFAULT_MODEL = 'jev-1.14.0'
// The diffstat travels in every part, so the diff gets what is left of the state.
const DIFF_CHAR_BUDGET = STATE_CHAR_BUDGET - DIFFSTAT_CHAR_BUDGET
const DESCRIPTION =
  "Ask the TypeSafe Jev model which kinds of proof a branch's change needs. Sends the diffstat and diff of <base>...HEAD, without lockfiles and generated files, and returns JSON: for screenshots, video, api and terminal a signal (suggest, reject or uncertain) with its probability, whether the change affects program behaviour at all and whether that suppresses the others, the Jev model that answered, and how much of the diff was assessed. Call it when planning proof for a pull request."

export function register(on, options) {
  on('session.start', async ($, e, next) => {
    // Without a key nothing may leave the machine, so the tool does not exist at all.
    if (await apiKey($, options)) {
      try {
        await $.tool.register({
          name: TOOL,
          description: DESCRIPTION,
          inputSchema: {
            type: 'object',
            properties: { base: { type: 'string', description: 'The branch the change merges into, such as main' } },
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
      return { result: JSON.stringify(await proofSignals($, e.base, options), null, 2) }
    } catch (error) {
      return unavailable(error instanceof Error ? error.message : String(error))
    }
  }).catch(($, e, next) => unavailable(`the hook failed (${next.error.kind}): ${next.error.message}`))
}

function unavailable(reason: string) {
  return { result: 'Proof signals unavailable: ' + reason }
}

async function apiKey($, options): Promise<string> {
  return trimmedOption(options?.typesafe_api_key, '') || trimmedOption(await $.env.get('TYPESAFE_API_KEY'), '')
}

async function proofSignals($, base: unknown, options) {
  if (!isSafeRef(base)) throw new Error('`base` must be a branch name, such as main')
  const key = await apiKey($, options)
  if (!key) throw new Error('no TypeSafe API key; set TYPESAFE_API_KEY or the pr-proof option typesafe_api_key')

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

  const request: JevRequest = {
    url: endpointUrl(options?.typesafe_endpoint),
    model: trimmedOption(options?.typesafe_model, DEFAULT_MODEL),
    key,
    questions: factQuestions(),
    limit: limiter(CONCURRENCY),
  }
  const context = { diffstat: clip(diffstat.trimEnd(), DIFFSTAT_CHAR_BUDGET) }

  const asked = await pool(plan.parts, CONCURRENCY, (part) => askPart($, request, context, part, 0))
  const results = asked.flatMap((a) => a.answered)
  const truncatedHunks = asked.reduce((sum, a) => sum + a.truncatedHunks, plan.truncatedHunks)

  const filesNotAssessed = plan.skippedFiles.length + unread.length
  return {
    model: results[0].model,
    ...aggregate(results.map((r) => r.answers)),
    coverage: {
      parts: results.length,
      filesNotAssessed,
      filesExcluded,
      truncatedHunks,
      partial: filesNotAssessed > 0 || truncatedHunks > 0,
    },
  }
}

function changedEntries(numstat: string): { path: string; binary: boolean }[] {
  return numstat.split('\0').filter(Boolean).map((line) => {
    const [added, , ...path] = line.split('\t')
    return { path: path.join('\t'), binary: added === '-' }
  })
}

type Answered = { model: string; answers: Answers }

async function askPart(
  $,
  request: JevRequest,
  context: { diffstat: string },
  part: Part,
  depth: number,
): Promise<{ answered: Answered[]; truncatedHunks: number }> {
  const body = JSON.stringify({ model: request.model, state: partState(part, context), questions: request.questions })
  const res = await send($, request, body)
  if (!res.ok) {
    if (depth < MAX_SPLIT_DEPTH && tooLong(res)) {
      const halves = halve(part)
      if (halves.parts.some((h) => h.diff.length < part.diff.length)) {
        const answered: Answered[] = []
        let truncatedHunks = halves.truncatedHunks
        for (const h of halves.parts) {
          const sub = await askPart($, request, context, h, depth + 1)
          answered.push(...sub.answered)
          truncatedHunks += sub.truncatedHunks
        }
        return { answered, truncatedHunks }
      }
    }
    throw new Error(httpError(res.status, res.text))
  }
  const data = JSON.parse(res.text)
  const answers: Answers = data.answers ?? {}
  const missing = missingFact(answers)
  if (missing) throw new Error(`TypeSafe returned no numeric answer for "${missing}"`)
  return { answered: [{ model: data.model, answers }], truncatedHunks: 0 }
}
