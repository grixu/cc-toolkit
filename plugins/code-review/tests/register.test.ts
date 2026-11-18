import { expect, test } from 'claude-code/testing'
import { CONTEXT_LINES, excerptAround, hunksAround, linesOf } from '../hooks/apply-decision.ts'
import { decideWalk, enabled } from '../hooks/register.ts'

const FILE = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join('\n')
const DIFF = [
  'diff --git a/src/a.ts b/src/a.ts',
  '@@ -1,2 +1,3 @@',
  '+top',
  '@@ -28,3 +29,4 @@',
  '+near the finding',
  '',
].join('\n')
const SCOPE = { checkout: '/work', diff_args: ['base..HEAD'], files: [{ path: 'src/a.ts' }], skipped: [{ path: 'pnpm-lock.yaml' }] }

type Wire = { needs_owner_facts: number; remedy_choice: number }

function fake(env: Record<string, string>, answer: (state: any) => Wire | number) {
  const sent: any[] = []
  const runs: { argv: string[]; cwd?: string }[] = []
  const $ = {
    env: { get: async (name: string) => env[name] },
    process: {
      run: async (argv: string[], init: { cwd?: string }) => {
        runs.push({ argv, cwd: init?.cwd })
        if (argv[0] === 'cat' && argv[2] === '/ctx/scope.json') return { exitCode: 0, stdout: JSON.stringify(SCOPE), stderr: '' }
        if (argv[0] === 'cat' && argv[2] === 'src/a.ts') return { exitCode: 0, stdout: FILE, stderr: '' }
        if (argv[0] === 'git') return { exitCode: 0, stdout: DIFF, stderr: '' }
        return { exitCode: 1, stdout: '', stderr: 'no such file' }
      },
    },
    http: {
      fetch: async (_url: string, init: { body: string }) => {
        const body = JSON.parse(init.body)
        sent.push(body)
        const a = answer(body.state)
        if (typeof a === 'number') return { ok: false, status: a, text: 'refused', headers: {} }
        return {
          ok: true,
          status: 200,
          text: JSON.stringify({ model: 'jev-test', answers: { needs_owner_facts: { noul: a.needs_owner_facts }, remedy_choice: { noul: a.remedy_choice } } }),
        }
      },
    },
  }
  return { $, sent, runs }
}

const FINDING = { id: 'f1', boy_scout: false, family: 'simplicity', rule: 'over-complex', severity: 'high', path: 'src/a.ts', lines: 'L30', problem: 'two copies drift', fix: 'collapse them' }
const OPTIONS = { decision_backend: 'typesafe' }
const LOW = { needs_owner_facts: 0.05, remedy_choice: 0.05 }

test('the tool is off until the user picks a backend', () => {
  expect(enabled({})).toBe(false)
  expect(enabled({ decision_backend: 'off' })).toBe(false)
  expect(enabled({ decision_backend: 'gemini' })).toBe(true)
})

test('code is built as the eval recovered it', () => {
  expect(linesOf('L18, L34-40')).toEqual({ from: 18, to: 40 })
  const excerpt = excerptAround(FILE, { from: 30, to: 30 })
  expect(excerpt.startsWith(`${30 - CONTEXT_LINES}\tline ${30 - CONTEXT_LINES}`)).toBe(true)
  expect(excerpt.endsWith(`${30 + CONTEXT_LINES}\tline ${30 + CONTEXT_LINES}`)).toBe(true)
  expect(hunksAround(DIFF, { from: 30, to: 30 })).toBe('@@ -28,3 +29,4 @@\n+near the finding\n')
  expect(hunksAround(DIFF, null)).toBe(null)
})

test('a low-risk fix is applied, with the code and changed files sent', async () => {
  const { $, sent, runs } = fake({ TYPESAFE_API_KEY: 'k' }, () => LOW)
  const result = await decideWalk($, { context: '/ctx', findings: [FINDING], conventions: 'none that change the verdict' }, OPTIONS)
  expect(result.backend).toBe('typesafe')
  expect(result.decisions[0]).toEqual({ id: 'f1', decision: 'apply', reasons: [], p: LOW })
  const state = sent[0].state
  expect(state.problem).toBe('two copies drift')
  expect(state.proposed_fix).toBe('collapse them')
  expect(state.code).toMatch(/^18\tline 18/)
  expect(state.diff_hunk).toMatch(/near the finding/)
  expect(state.change.changed_files).toEqual(['src/a.ts', 'pnpm-lock.yaml'])
  expect(state.change.conventions).toBeUndefined()
  expect(runs.filter((r) => r.argv[0] !== 'cat' || r.argv[2] !== '/ctx/scope.json').every((r) => r.cwd === '/work')).toBe(true)
})

test('a fix that needs owner facts is asked', async () => {
  const { $ } = fake({ TYPESAFE_API_KEY: 'k' }, () => ({ needs_owner_facts: 0.9, remedy_choice: 0.05 }))
  const [d] = (await decideWalk($, { context: '/ctx', findings: [FINDING] }, OPTIONS)).decisions
  expect(d.decision).toBe('ask')
})

test('security, spec and boy-scout findings are never sent', async () => {
  const { $, sent } = fake({ TYPESAFE_API_KEY: 'k' }, () => LOW)
  const findings = [
    { ...FINDING, id: 's', family: 'security' },
    { ...FINDING, id: 'p', family: 'spec' },
    { ...FINDING, id: 'b', boy_scout: true },
    { ...FINDING, id: 'tick', family: '`Security`' },
    { ...FINDING, id: 'nofamily', family: undefined },
    { ...FINDING, id: 'nobs', boy_scout: undefined },
  ]
  const result = await decideWalk($, { context: '/ctx', findings }, OPTIONS)
  expect(result.decisions.map((d) => d.decision)).toEqual(['ask', 'ask', 'ask', 'ask', 'ask', 'ask'])
  expect(sent.length).toBe(0)
})

test('a failed request or an unreadable file asks for that finding only', async () => {
  const { $ } = fake({ TYPESAFE_API_KEY: 'k' }, (state) => (state.problem === 'refused' ? 422 : LOW))
  const findings = [FINDING, { ...FINDING, id: 'r', problem: 'refused' }, { ...FINDING, id: 'm', path: 'src/missing.ts' }, { ...FINDING, id: 'x', path: '../etc/passwd' }]
  const result = await decideWalk($, { context: '/ctx', findings }, OPTIONS)
  expect(result.decisions.map((d) => d.decision)).toEqual(['apply', 'ask', 'ask', 'ask'])
})

test('auto with both keys asks the user to choose Jev or Gemini', async () => {
  const { $ } = fake({ TYPESAFE_API_KEY: 'k', GEMINI_DECISIONS_API_KEY: 'g' }, () => LOW)
  const result = await decideWalk($, { context: '/ctx', findings: [FINDING] }, { decision_backend: 'auto' })
  expect(result).toMatch(/^Backend choice needed:.*typesafe \(Jev\) or gemini/)
  const error = await decideWalk($, { context: '/ctx', findings: [FINDING], backend: 'both' }, { decision_backend: 'auto' }).then(
    () => '',
    (e: Error) => e.message,
  )
  expect(error).toMatch(/typesafe or gemini/)
})

test('the user\'s backend answer picks the thresholds', async () => {
  const { $ } = fake({ TYPESAFE_API_KEY: 'k', GEMINI_DECISIONS_API_KEY: 'g' }, () => LOW)
  const result = await decideWalk($, { context: '/ctx', findings: [FINDING], backend: 'typesafe' }, { decision_backend: 'auto' })
  expect(result.backend).toBe('typesafe')
  expect(result.thresholds).toEqual({ facts: 0.35, remedy: 0.7 })
})
