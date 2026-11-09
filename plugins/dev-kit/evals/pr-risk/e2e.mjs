#!/usr/bin/env node
// Runs the real pr-open skill, refreshing the description of each labelled pull request, and scores the level its
// pr_risk call returns. Slices, context and testing policy come from pr-open itself, so this measures the shipped
// mechanism end to end, not the scorer alone (fe-eval.mjs does that).
//
//   node plugins/dev-kit/evals/pr-risk/e2e.mjs --limit 3                 # smoke
//   node plugins/dev-kit/evals/pr-risk/e2e.mjs --block R --max-usd 40
//   ... --data <dir>    a pulled set, default evals/pr-risk/local/data/v8
//   ... --cases a,b     these case ids only
//
// Each case gets a sandbox: a bare origin whose main is the PR's base and whose branch is its head, a checkout of the
// head, and the gh stand-in serving the PR's title and body from the set. Pushes land in the sandbox origin; the stand-in
// refuses anything else. Needs TYPESAFE_API_KEY, the Claude Agent SDK's session, and ssh access to the repositories
// for blobs the shared bare clones do not hold yet. Results go to evals/.results/pr-risk/.
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { loadSet, metrics } from './fe-eval.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGIN = resolve(HERE, '../..')
const SANDBOX = join(HERE, '../.sandbox/pr-risk')
const TOOL = 'mcp__dev-kit__pr_risk'
const PROMPT = '/dev-kit:pr-open Refresh the description of the existing pull request for this branch.'

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(r.stderr ?? '').trim()}`)
  return r.stdout.trim()
}

// The shared bare clones are partial (blob:none) with GitHub as promisor; a sandbox repository borrows their objects
// through alternates and fetches missing blobs from the same promisor, so nothing is pushed back to GitHub.
function borrow(dir, shared, bare) {
  git(['init', '-q', ...(bare ? ['--bare'] : []), dir])
  const gitDir = bare ? dir : join(dir, '.git')
  writeFileSync(join(gitDir, 'objects/info/alternates'), join(shared, 'objects') + '\n')
  const url = git(['config', 'remote.origin.url'], shared)
  for (const [k, v] of [['extensions.partialClone', 'github'], ['remote.github.url', url], ['remote.github.promisor', 'true'], ['remote.github.partialclonefilter', 'blob:none'], ['remote.github.pushurl', 'no-push://refused']])
    git(['config', k, v], dir)
}

function prepare(c, pr) {
  const shared = join(SANDBOX, 'repos', c.repo.replace('/', '__'))
  if (!existsSync(shared)) throw new Error(`no clone of ${c.repo} in ${shared}; run run.mjs once for it`)
  const [base, head] = [pr.baseRefOid, pr.headRefOid]
  for (const sha of [base, head])
    if (spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: shared }).status !== 0) git(['fetch', '-q', '--filter=blob:none', 'origin', sha], shared)
  const dir = join(SANDBOX, 'e2e', c.id)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'bin'), { recursive: true })
  const branch = `pr-${c.number}`
  const origin = join(dir, 'origin.git')
  borrow(origin, shared, true)
  git(['update-ref', 'refs/heads/main', base], origin)
  git(['update-ref', `refs/heads/${branch}`, head], origin)
  git(['update-ref', `refs/pull/${c.number}/head`, head], origin)
  git(['symbolic-ref', 'HEAD', 'refs/heads/main'], origin)
  const work = join(dir, 'work')
  borrow(work, shared, false)
  git(['remote', 'add', 'origin', origin], work)
  git(['fetch', '-q', 'origin'], work)
  git(['checkout', '-q', '-b', branch, '--track', `origin/${branch}`], work)

  copyFileSync(join(HERE, '../gh-stand-in.sh'), join(dir, 'bin/gh'))
  const prDir = join(dir, 'prs', String(c.number))
  mkdirSync(prDir, { recursive: true })
  writeFileSync(join(prDir, 'origin'), origin + '\n')
  writeFileSync(join(prDir, 'comments.json'), '[]\n')
  writeFileSync(join(prDir, 'pr.json'), JSON.stringify({ number: c.number, title: pr.title, author: { login: 'eval-user' }, headRefName: branch,
    baseRefName: 'main', state: 'OPEN', isDraft: false, labels: [], assignees: [], body: pr.body ?? '' }) + '\n')
  mkdirSync(join(dir, 'gh-config'))
  return { dir, work }
}

// The real gh, curl and pushes outside the sandbox origin are refused; everything else runs inside the checkout.
const REFUSED = /(^|[\s;&|(])(\/\S+\/gh|curl|wget|ssh)\s|git\s+push\s+(?!origin\b|-u\s+origin\b|--set-upstream\s+origin\b)\S/

async function runCase(c, pr, budgetUsd) {
  const { dir, work } = prepare(c, pr)
  const env = { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, GH_CONFIG_DIR: join(dir, 'gh-config'), GH_TOKEN: '', GITHUB_TOKEN: '', GITHUB_ACTIONS: '' }
  const calls = new Map()
  const out = { id: c.id, calls: [], denied: [], costUsd: 0, turns: 0 }
  const started = Date.now()
  try {
    for await (const m of query({
      prompt: PROMPT,
      options: {
        cwd: work, env, settingSources: [], plugins: [{ type: 'local', path: PLUGIN }], maxBudgetUsd: budgetUsd, maxTurns: 60,
        canUseTool: async (name, input) => {
          if (name === 'AskUserQuestion') {
            const answers = Object.fromEntries((input.questions ?? []).map((q) => [q.question, q.options?.[0]?.label ?? '']))
            return { behavior: 'allow', updatedInput: { ...input, answers } }
          }
          if (name === 'Bash' && REFUSED.test(String(input.command ?? ''))) {
            out.denied.push(String(input.command))
            return { behavior: 'deny', message: 'Not available in this sandbox.' }
          }
          return { behavior: 'allow', updatedInput: input }
        },
      },
    })) {
      if (m.type === 'assistant')
        for (const b of m.message.content ?? []) if (b.type === 'tool_use' && b.name === TOOL) calls.set(b.id, { input: b.input })
      if (m.type === 'user' && Array.isArray(m.message.content))
        for (const b of m.message.content) if (b.type === 'tool_result' && calls.has(b.tool_use_id)) {
          const text = Array.isArray(b.content) ? b.content.map((x) => x.text ?? '').join('') : String(b.content ?? '')
          calls.get(b.tool_use_id).result = text
        }
      if (m.type === 'result') Object.assign(out, { costUsd: m.total_cost_usd ?? 0, turns: m.num_turns, subtype: m.subtype })
    }
  } catch (e) {
    out.error = String(e.message ?? e)
  }
  out.wallMs = Date.now() - started
  out.calls = [...calls.values()].map(({ input, result }) => {
    let report
    try { report = JSON.parse(result ?? '') } catch { report = undefined }
    return {
      input: { slices: input.slices?.map((s) => ({ title: s.title, files: s.files?.length })), contextChars: input.context?.length ?? 0, testingPolicy: Boolean(input.testing_policy) },
      level: report?.level, scorer: report?.scorer, partial: report?.coverage?.partial, jevRequests: report?.coverage?.requests,
      unavailable: report ? undefined : String(result ?? '').slice(0, 200),
    }
  })
  const last = out.calls.at(-1)
  out.level = last?.level
  out.bodyWritten = existsSync(join(dir, `gh-posted-pr-edit-${c.number}.md`))
  return out
}

async function main() {
  const { values } = parseArgs({ options: {
    data: { type: 'string' }, limit: { type: 'string' }, cases: { type: 'string' }, block: { type: 'string', default: 'R' }, 'max-usd': { type: 'string', default: '10' },
  } })
  if (!process.env.TYPESAFE_API_KEY) throw new Error('TYPESAFE_API_KEY required')
  const d = loadSet(resolve(values.data ?? join(HERE, 'local/data/v8')))
  const wanted = values.cases ? new Set(values.cases.split(',')) : undefined
  let roster = d.roster.filter((r) => (wanted ? wanted.has(r.id) : values.block === 'all' || r.block.startsWith(values.block))).sort((a, b) => a.id.localeCompare(b.id))
  if (values.limit) roster = roster.slice(0, Number(values.limit))
  const maxUsd = Number(values['max-usd'])
  const results = []
  let spent = 0
  for (const c of roster) {
    if (spent >= maxUsd) { results.push({ id: c.id, skipped: 'budget' }); continue }
    const r = await runCase(c, d.prs[c.id], maxUsd - spent)
    spent += r.costUsd
    results.push(r)
    console.log(`${c.id}: ${r.level ?? 'no level'}${r.error ? ` (${r.error})` : ''} · $${r.costUsd.toFixed(2)} · ${(r.wallMs / 1000).toFixed(0)}s · ${r.calls.length} pr_risk call(s)`)
  }
  const ids = new Set(results.filter((r) => r.calls?.length).map((r) => r.id))
  const round = Object.fromEntries(results.filter((r) => r.level).map((r) => [r.id, { level: r.level }]))
  const views = {}
  for (const view of [...new Set(d.labels.map((l) => l.view))].sort()) views[view] = metrics([round], d.labels.filter((l) => l.view === view && roster.some((c) => c.id === l.id)))
  const report = {
    createdAt: new Date().toISOString(), git: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: HERE, encoding: 'utf8' }).stdout.trim(),
    cases: roster.length, assessed: ids.size, costUsd: spent, views, results,
  }
  const outDir = join(HERE, '../.results/pr-risk')
  mkdirSync(outDir, { recursive: true })
  const file = join(outDir, `e2e-${report.createdAt.replace(/[:.]/g, '-')}.json`)
  writeFileSync(file, JSON.stringify(report, null, 1) + '\n')
  for (const [v, m] of Object.entries(views))
    console.log(`view ${v}: n ${m.n} cost ${m.cost.toFixed(3)} exact ${(m.exact * 100).toFixed(1)}% under ${(m.under * 100).toFixed(1)}% (an unassessed case counts as medium)`)
  console.log(`assessed ${ids.size}/${roster.length} · $${spent.toFixed(2)} → ${file}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
