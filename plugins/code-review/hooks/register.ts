import { ask, limiter } from './decision.ts'
import { CHOICE_NEEDED, chooseBackends, createProvider, hasAnyKey, providerKeys } from './providers/index.ts'
import { INERT_CONVENTIONS, THRESHOLDS, applyDecisionRequest, excerptAround, hunksAround, linesOf, walkDecision, type Finding } from './apply-decision.ts'

const TOOL = 'apply_decision'
export const TOOL_ID = 'mcp__code-review__apply_decision'
const CONCURRENCY = 4
const BACKENDS = ['typesafe', 'gemini'] as const
// The recorded walks held too few of these to measure: security and spec fixes, and boy-scout fixes, which the owner
// declined 5 times in 13.
const ALWAYS_ASK_FAMILIES = new Set(['security', 'spec'])

const DESCRIPTION =
  "Decide, for each fix in a code review's structural walk, whether it can be applied without asking its owner. A decision model (TypeSafe Jev or Gemini Decision, as the user configured) judges whether the fix needs a fact the review cannot know and whether another remedy would behave differently; the tool reads each finding's code and diff hunk from the review's checkout itself. Returns JSON with `apply` or `ask` per finding id and the reasons. Security, spec and boy-scout findings always return `ask`. Call it once, before the first walk question."

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

// Off unless the user picked a backend: the tool sends code excerpts to an outside service.
export function enabled(options): boolean {
  const mode = text(options?.decision_backend)
  return mode !== '' && mode !== 'off'
}

export function register(on, options) {
  on('session.start', async ($, e, next) => {
    if (enabled(options) && hasAnyKey(await providerKeys($, options))) {
      try {
        await $.tool.register({
          name: TOOL,
          description: DESCRIPTION,
          inputSchema: {
            type: 'object',
            properties: {
              context: { type: 'string', description: "The review's context directory: the absolute path holding its scope.json." },
              scope: { type: 'string', description: "Optional. The report's scope, the text after `## Code review — `." },
              conventions: { type: 'string', description: "Optional. The report's **Conventions:** line, verbatim." },
              findings: {
                type: 'array',
                minItems: 1,
                description: 'The fixes the walk would ask about, one entry per report bullet.',
                items: {
                  type: 'object',
                  required: ['id', 'family', 'path', 'boy_scout', 'problem'],
                  properties: {
                    id: { type: 'string', description: 'Any id that is unique within this call; the result echoes it.' },
                    severity: { type: 'string' },
                    family: { type: 'string', description: 'The bullet\'s family, such as simplicity or correctness' },
                    rule: { type: 'string' },
                    path: { type: 'string', description: 'The file, relative to the checkout, as the report heads it' },
                    lines: { type: 'string', description: 'The bullet\'s lines, such as L18, L34-40' },
                    boy_scout: { type: 'boolean', description: 'True for a finding in code the change did not touch' },
                    problem: { type: 'string', description: 'The bullet\'s text before `→`: what is wrong' },
                    fix: { type: 'string', description: 'The bullet\'s text after `→`: the edit the review proposes' },
                  },
                },
              },
              backend: {
                type: 'string',
                enum: [...BACKENDS],
                description: 'Optional. The backend the user chose. Pass it only with the user\'s answer after a "Backend choice needed" result.',
              },
            },
            required: ['context', 'findings'],
          },
        })
      } catch {
        // A refused registration leaves the session without the tool, and start-cr then walks every fix.
      }
    }
    return next(e)
  })

  on('tool.call', { tool: TOOL_ID }, async ($, e) => {
    try {
      const result = await decideWalk($, e, options)
      return { result: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }
    } catch (error) {
      return unavailable(error instanceof Error ? error.message : String(error))
    }
  }).catch(($, e, next) => unavailable(`the hook failed (${next.error.kind}): ${next.error.message}`))
}

function unavailable(reason: string) {
  return { result: 'Apply decision unavailable: ' + reason }
}

type WalkFinding = { id: string; severity?: string; family?: string; rule?: string; path: string; lines?: string; boy_scout?: boolean; problem: string; fix?: string }
type Scope = { checkout: string; diffArgs: string[] | null; changedFiles: string[] }

export async function decideWalk($, input, options) {
  const context = text(input?.context)
  if (!context.startsWith('/')) throw new Error('`context` must be the absolute path of the review\'s context directory')
  const findings: WalkFinding[] = Array.isArray(input?.findings) ? input.findings : []
  if (!findings.length) throw new Error('`findings` is empty')
  if (input.backend !== undefined && !(BACKENDS as readonly unknown[]).includes(input.backend))
    throw new Error('`backend` must be typesafe or gemini')

  const keys = await providerKeys($, options)
  const chosen = chooseBackends(options, input.backend, keys, 'code-review')
  if (chosen === 'choose')
    return `${CHOICE_NEEDED} both a TypeSafe and a Gemini key are set and decision_backend is auto. Ask the user whether to use typesafe (Jev) or gemini, then call ${TOOL_ID} again with \`backend\` set to the answer.`
  const name = chosen[0]
  const provider = createProvider(name, keys, options)
  const thresholds = THRESHOLDS[name]
  const limit = limiter(CONCURRENCY)
  const scope = await readScope($, context)
  const conventions = text(input.conventions)
  const review = {
    scope: text(input.scope) || null,
    conventions: conventions && !INERT_CONVENTIONS.test(conventions) ? conventions : null,
    changedFiles: scope.changedFiles,
  }

  const decisions = await Promise.all(
    findings.map(async (f, i) => {
      const id = text(f?.id) || String(i + 1)
      // Fails closed: the agent may pass the family as the report prints it (`security`), capitalised, or not at all.
      const family = text(f?.family).replace(/`/g, '').toLowerCase()
      if (!family) return { id, decision: 'ask', reasons: ['no family given'] }
      if (ALWAYS_ASK_FAMILIES.has(family)) return { id, decision: 'ask', reasons: [`${family} fixes are always walked`] }
      if (f?.boy_scout !== false) return { id, decision: 'ask', reasons: ['boy-scout fixes are always walked, and boy_scout was not false'] }
      try {
        const code = await codeFor($, scope, f)
        const finding: Finding = {
          severity: f.severity,
          family,
          rule: f.rule,
          path: f.path,
          lines: f.lines,
          risk: 'structural',
          problem: f.problem,
          fix: f.fix,
          ...code,
        }
        const { answers } = await ask($, provider, applyDecisionRequest(finding, review), limit)
        const verdict = walkDecision(answers, thresholds)
        const p = (key: string) => (answers[key]?.type === 'binary' ? Math.round(answers[key].p * 100) / 100 : null)
        return { id, ...verdict, p: { needs_owner_facts: p('needs_owner_facts'), remedy_choice: p('remedy_choice') } }
      } catch (error) {
        return { id, decision: 'ask', reasons: [`no decision: ${error instanceof Error ? error.message : String(error)}`] }
      }
    }),
  )
  return { backend: name, model: provider.model, thresholds, decisions }
}

async function readScope($, context: string): Promise<Scope> {
  const raw = await run($, ['cat', '--', `${context}/scope.json`])
  let scope
  try {
    scope = JSON.parse(raw)
  } catch {
    throw new Error(`${context}/scope.json is not valid JSON`)
  }
  const checkout = text(scope?.checkout)
  if (!checkout.startsWith('/')) throw new Error(`${context}/scope.json has no absolute \`checkout\``)
  const paths = (list) => (Array.isArray(list) ? list.map((f) => text(f?.path)).filter(Boolean) : [])
  return {
    checkout,
    diffArgs: Array.isArray(scope.diff_args) ? scope.diff_args.map(String) : null,
    changedFiles: [...paths(scope.files), ...paths(scope.skipped)],
  }
}

// The same excerpt and hunk the eval recovered from git: the file around the finding's lines and the change's hunks
// that overlap them.
async function codeFor($, scope: Scope, f: WalkFinding): Promise<Pick<Finding, 'excerpt' | 'hunk'>> {
  const path = text(f.path).replace(/^\.\//, '')
  if (!path || path.startsWith('/') || path.split('/').includes('..')) throw new Error(`\`path\` must be relative to the checkout: ${f.path}`)
  const range = linesOf(f.lines)
  const file = await run($, ['cat', '--', path], scope.checkout)
  const diff = scope.diffArgs
    ? await run($, ['git', 'diff', '--no-relative', '-U3', '--no-color', '--no-ext-diff', ...scope.diffArgs, '--', `:(top,literal)${path}`], scope.checkout)
    : ''
  return { excerpt: excerptAround(file, range), hunk: hunksAround(diff, range) }
}

async function run($, argv: string[], cwd?: string): Promise<string> {
  const r = await $.process.run(argv, cwd ? { cwd, timeoutMs: 60_000 } : { timeoutMs: 60_000 })
  if (r.exitCode !== 0) throw new Error(`${argv[0]} ${argv.at(-1)} failed: ${String(r.stderr).trim().slice(0, 300)}`)
  return r.stdout
}
