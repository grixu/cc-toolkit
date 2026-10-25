import { expect, mock, test } from 'claude-code/testing'
import { labelFor, readConfig, rubric, split } from '../hooks/risk.ts'

const TOOL = 'mcp__dev-kit__pr_risk'

type Numstat = { path: string; text?: string; binary?: boolean }

const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } })

function fakeGit(files: Numstat[]) {
  return ($, e) => {
    const args: string[] = e.argv.slice(1)
    if (args[0] === 'rev-parse') return { value: { exitCode: args[3] === 'origin/main^{commit}' ? 0 : 1, stdout: '', stderr: '' } }
    if (args[0] === 'log') return ok('abc123 feat: add login\n')
    if (args.includes('--stat=200')) return ok(files.map((f) => ` ${f.path} | 1 +`).join('\n'))
    if (args.includes('--numstat')) return ok(files.map((f) => `${f.binary ? '-' : '1'}\t${f.binary ? '-' : '0'}\t${f.path}\0`).join(''))
    const path = args[args.length - 1]
    return ok(files.find((f) => f.path === path)?.text ?? '')
  }
}

function jevAnswer(score: number, nouls: Record<string, number> = {}) {
  const answers: Record<string, unknown> = { overall_risk: { type: 'score', score, confidence: 0.7 } }
  for (const key of ['security', 'data', 'contract', 'infra', 'irreversible', 'untested'])
    answers[key] = { type: 'noul', noul: nouls[key] ?? 0.1 }
  return { status: 200, ok: true, headers: {}, text: JSON.stringify({ model: 'jev-1.14.0', answers, usage: {} }) }
}

const fileDiff = (path: string, body: string) =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,1 +1,2 @@\n${body}`

test('registers the tool only when a key is set', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  const registered: string[] = []
  on('tool.register', ($, e) => {
    registered.push(e.name)
    return { value: { tool: TOOL } }
  })
  on('session.start', () => ({ cwd: '/work' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(registered).toEqual(['pr_risk'])
})

test('without a key the tool is not registered', async ($, on) => {
  mock.env(on, {})
  const registered: string[] = []
  on('tool.register', ($, e) => {
    registered.push(e.name)
    return { value: { tool: TOOL } }
  })
  on('session.start', () => ({ cwd: '/work' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(registered).toEqual([])
})

test('assesses the diff without lockfiles and binaries', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  on(
    'process.run',
    fakeGit([
      { path: 'src/auth.ts', text: fileDiff('src/auth.ts', '+checkToken()') },
      { path: 'pnpm-lock.yaml', text: fileDiff('pnpm-lock.yaml', '+lock') },
      { path: 'logo.png', binary: true },
    ]),
  )
  const requests: { url: string; init: { headers: Record<string, string>; body: string } }[] = []
  on('http.fetch', ($, e) => {
    requests.push(e)
    return { value: jevAnswer(2.4, { security: 0.9 }) }
  })

  const out = await $.tool.call({ tool: TOOL, base: 'main' })
  const report = JSON.parse(out.result)

  expect(requests.length).toBe(1)
  expect(requests[0].url).toBe('https://api.typesafe.ai/v1/systemone')
  expect(requests[0].init.headers.authorization).toBe('Bearer secret')
  const body = JSON.parse(requests[0].init.body)
  expect(body.model).toBe('jev-latest')
  expect(body.state.diff).toContain('checkToken')
  expect(body.state.diff).not.toContain('pnpm-lock.yaml')
  expect(body.questions.overall_risk.criteria.length).toBe(4)

  expect(report.level).toBe('high')
  expect(report.base).toBe('origin/main')
  expect(report.flags.map((f) => f.key)).toEqual(['security'])
  expect(report.label).toEqual({
    enabled: true,
    name: 'risk: high',
    all: ['risk: low', 'risk: medium', 'risk: high', 'risk: critical'],
  })
  expect(report.coverage).toMatchObject({ requests: 1, filesAssessed: 1, filesExcluded: 2, partial: false })
})

test('splits a large diff across requests and keeps the riskiest part', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  const big = (path: string) => ({ path, text: fileDiff(path, '+x'.repeat(30_000)) })
  on('process.run', fakeGit([big('a.ts'), big('b.ts'), big('c.ts')]))
  let n = 0
  on('http.fetch', () => {
    n += 1
    return { value: n === 2 ? jevAnswer(3.2, { data: 0.8 }) : jevAnswer(0.4) }
  })

  const report = JSON.parse((await $.tool.call({ tool: TOOL, base: 'main' })).result)

  expect(report.coverage.requests).toBe(n)
  expect(n > 1).toBe(true)
  expect(report.level).toBe('critical')
  expect(report.flags.map((f) => f.key)).toEqual(['data'])
})

test('reports a rejected key', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'bad' })
  on('process.run', fakeGit([{ path: 'a.ts', text: fileDiff('a.ts', '+a') }]))
  on('http.fetch', () => ({ value: { status: 401, ok: false, headers: {}, text: 'unauthorized' } }))
  const out = await $.tool.call({ tool: TOOL, base: 'main' })
  expect(out.result).toMatch(/^Risk assessment unavailable: TypeSafe rejected the API key \(HTTP 401\)/)
})

test('refuses a base that git could read as an option', async ($, on) => {
  mock.env(on, { TYPESAFE_API_KEY: 'secret' })
  const out = await $.tool.call({ tool: TOOL, base: '--output=/tmp/x' })
  expect(out.result).toMatch(/`base` must be a branch name/)
})

test('maps the rubric onto the configured levels', () => {
  const three = rubric(['low', 'medium', 'high'])
  expect(three.length).toBe(3)
  expect(three[0]).toMatch(/^low: Documentation/)
  expect(three[2]).toMatch(/^high: A defect would likely cause an outage/)
  expect(readConfig({ risk_levels: ['only'] }).levels).toEqual(['low', 'medium', 'high', 'critical'])
  expect(readConfig({ risk_levels: 'minor, major' }).levels).toEqual(['minor', 'major'])
  expect(readConfig({ risk_label: false }).labelEnabled).toBe(false)
  expect(labelFor('risk/{level}', 'high')).toBe('risk/high')
  expect(labelFor('risk', 'high')).toBe('risk: high')
})

test('reports files beyond the request cap as not assessed', () => {
  const files = ['a', 'b', 'c'].map((p) => ({ path: p, text: 'x'.repeat(90) }))
  const plan = split(files, 100, 2)
  expect(plan.parts.map((p) => p.files)).toEqual([['a'], ['b']])
  expect(plan.skippedFiles).toEqual(['c'])
})
