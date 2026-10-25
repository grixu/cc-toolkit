import {
  MAX_PARTS,
  STATE_CHAR_BUDGET,
  aggregate,
  endpointUrl,
  header,
  httpError,
  isExcluded,
  isSafeRef,
  missingAnswer,
  questions,
  readConfig,
  split,
  trimmedOption,
  type FileDiff,
  type PartResult,
} from './risk.ts'

const TOOL = 'pr_risk'
const LOW_CONFIDENCE = 0.5
const NOT_ASSESSED_SAMPLE = 20
const DESCRIPTION =
  'Assess the risk a branch introduces, with the TypeSafe Jev model. Sends the commits, diffstat and diff of <base>...HEAD in the current repository to TypeSafe and returns JSON: risk level, score, confidence, risk flags with probabilities, the GitHub label to apply, and how much of the diff was assessed. Call it when preparing or reviewing a pull request.'

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
      const report = await assess($, e.base, options, config)
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

async function assess($, base: unknown, options, config) {
  if (!isSafeRef(base)) throw new Error('`base` must be a branch name, such as main')
  const key = await apiKey($, options)
  if (!key) throw new Error('no TypeSafe API key; set TYPESAFE_API_KEY or the dev-kit option typesafe_api_key')

  const ref = await resolveBase($, base)
  const range = `${ref}...HEAD`
  const [commits, diffstat, numstat] = await Promise.all([
    git($, ['log', '--no-color', '--format=%h %s%n%b', `${ref}..HEAD`]),
    git($, ['diff', '--no-color', '--stat=200', range]),
    git($, ['diff', '--numstat', '-z', '--no-renames', range]),
  ])

  const entries = numstat.split('\0').filter(Boolean).map((line) => {
    const [added, , ...path] = line.split('\t')
    return { path: path.join('\t'), binary: added === '-' }
  })
  if (!entries.length) throw new Error(`no changes between ${ref} and HEAD`)

  const isReviewable = (f: { path: string; binary: boolean }) => !f.binary && !isExcluded(f.path)
  const excluded = entries.filter((f) => !isReviewable(f)).map((f) => f.path)
  const reviewable = entries.filter(isReviewable).map((f) => f.path)

  const head = header(commits.trim(), diffstat.trim())
  const budget = STATE_CHAR_BUDGET - head.commits.length - head.diffstat.length
  const { files, unread } = await readDiffs($, range, reviewable, budget)

  const plan = split(files, budget)
  const parts = plan.parts.length
    ? plan.parts
    : [{ files: [], diff: '(no reviewable text diff: only lockfiles, binary or generated files changed)' }]

  const request: JevRequest = {
    url: endpointUrl(options?.typesafe_endpoint),
    model: trimmedOption(options?.typesafe_model, 'jev-latest'),
    key,
    questions: questions(config.levels),
  }
  const results = await requestParts($, request, head, parts)

  const report = aggregate(results, config)
  const notAssessed = [...plan.skippedFiles, ...unread]
  return {
    ...report,
    base: ref,
    lowConfidence: report.confidence < LOW_CONFIDENCE,
    coverage: {
      requests: parts.length,
      filesAssessed: reviewable.length - notAssessed.length,
      filesNotAssessed: notAssessed.length,
      filesNotAssessedSample: notAssessed.slice(0, NOT_ASSESSED_SAMPLE),
      filesExcluded: excluded.length,
      truncatedHunks: plan.truncatedHunks,
      partial: notAssessed.length > 0 || plan.truncatedHunks > 0,
    },
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

async function readDiffs($, range: string, paths: string[], budget: number): Promise<{ files: FileDiff[]; unread: string[] }> {
  const files: FileDiff[] = []
  const unread: string[] = []
  let charsRead = 0
  // Stop reading once the diff cannot fit in MAX_PARTS requests; the rest is reported as not assessed.
  for (const path of paths) {
    if (charsRead > budget * MAX_PARTS) {
      unread.push(path)
      continue
    }
    const text = await git($, ['diff', '-U1', '--no-color', '--no-ext-diff', '--no-renames', range, '--', `:(literal)${path}`])
    charsRead += text.length
    files.push({ path, text: text.trimEnd() })
  }
  return { files, unread }
}

type JevRequest = { url: string; model: string; key: string; questions: Record<string, unknown> }

async function requestParts(
  $,
  request: JevRequest,
  head: { commits: string; diffstat: string },
  parts: { diff: string }[],
): Promise<PartResult[]> {
  const results: PartResult[] = []
  for (const [i, part] of parts.entries()) {
    const res = await $.http.fetch(request.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${request.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        state: { ...head, part: `${i + 1} of ${parts.length}`, diff: part.diff },
        questions: request.questions,
      }),
    })
    if (!res.ok) throw new Error(httpError(res.status, res.text))
    const data = JSON.parse(res.text)
    const answers = data.answers ?? {}
    const missing = missingAnswer(answers)
    if (missing) throw new Error(`TypeSafe returned no numeric answer for "${missing}" (part ${i + 1} of ${parts.length})`)
    results.push({ model: data.model, answers })
  }
  return results
}

async function git($, args: string[]): Promise<string> {
  const r = await $.process.run(['git', ...args], { timeoutMs: 60_000 })
  if (r.exitCode !== 0) throw new Error(`git ${args[0]} failed: ${r.stderr.trim().slice(0, 300)}`)
  return r.stdout
}
