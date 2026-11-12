#!/usr/bin/env node
// Scores the production factor scorer (hooks/factors.ts) on a frozen, labelled cohort pulled from R2 (data.mjs).
//
//   node plugins/dev-kit/evals/pr-risk/fe-eval.mjs --replay            # recorded Jev answers; proves the port
//   node plugins/dev-kit/evals/pr-risk/fe-eval.mjs --live --limit 20   # the same states sent to Jev now
//   ... --data <dir>       # a pulled set, default evals/pr-risk/local/data/v8
//   ... --model <name>     # live only; default DEFAULT_MODEL
//   ... --backend gemini   # live only; asks Gemini Decision (GEMINI_DECISIONS_API_KEY or GEMINI_API_KEY) instead of Jev
//
// --replay fails unless every factor state and request body production builds equals the frozen ones byte for byte,
// and the cost equals the cohort's recorded baseline. --live measures drift of Jev and of the questions against the
// recorded answers, with cost and latency. Results go to evals/.results/pr-risk/.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { DEFAULT_MODEL } from '../../hooks/evidence.ts'
import { FACTOR_REPEATS, averageAnswers, factorBodies, factorGroup, scoreFactors, testsInChange } from '../../hooks/factors.ts'
import { GEMINI_MODEL, backendFor, readResponse, requestInit, tooLong } from '../../hooks/backend.ts'
import { endpointUrl } from '../../hooks/risk.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const LEVELS = ['low', 'medium', 'high', 'critical']
const CONCURRENCY = 4
const RETRIES = 2
const B = 2000

const sha = (t) => createHash('sha256').update(t).digest('hex')
const decode = (_key, value) => (value?.$map ? new Map(value.$map) : value?.$set ? new Set(value.$set) : value)

export function loadSet(dir) {
  const json = (name, reviver) => JSON.parse(readFileSync(join(dir, name), 'utf8'), reviver)
  const seal = json('labels-seal.json')
  if (sha(readFileSync(join(dir, 'labels.jsonl'))) !== seal.sha256) throw new Error('labels.jsonl is not the sealed file')
  return {
    bindings: json('bindings.json'),
    frozenStates: json('factor-states.json'),
    inputs: [json('inputs-r1.json', decode), json('inputs-r2.json', decode)],
    control: json('control.json').rounds,
    plan: json('plan-factors.json'),
    result: json('result-factors.json'),
    prs: json('prs.json'),
    labels: readFileSync(join(dir, 'labels.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)),
    roster: json('roster.json').roster,
    baseline: json('baseline.json'),
  }
}

const firstPerTwin = (bindings) => [...new Map(bindings.map((b) => [b.twin, b])).values()]

function testsOfCases(bindings) {
  const paths = {}
  for (const b of bindings) (paths[b.id] ??= []).push(...b.state.files)
  return Object.fromEntries(Object.entries(paths).map(([id, ps]) => [id, testsInChange(ps)]))
}

/** Every state and request body production builds, against the frozen ones; returns the mismatch counts. */
export function portCheck(d) {
  const tests = testsOfCases(d.bindings)
  const frozen = new Map(d.frozenStates.map((s) => [s.twin, s]))
  const planned = new Map()
  for (const r of d.plan.requests) if (r.repeat === 1) (planned.get(r.twin) ?? planned.set(r.twin, []).get(r.twin)).push(r.sha256)
  let states = 0, bodies = 0, checked = 0
  for (const b of firstPerTwin(d.bindings)) {
    checked++
    const f = frozen.get(b.twin)
    const built = factorBodies(d.plan.model, b.state, tests[b.id])
    if (!built) {
      if (!f?.skip) states++
      continue
    }
    if (!f || f.skip || f.testOnly !== built.testOnly || JSON.stringify(JSON.parse(built.bodies[0]).state) !== JSON.stringify(f.state)) states++
    if (JSON.stringify(built.bodies.map(sha)) !== JSON.stringify(planned.get(b.twin) ?? [])) bodies++
  }
  return { checked, states, bodies }
}

/** Factor answers per twin: each repeat's bodies merged, then the repeats averaged, as production does. */
export function answersOf(rows) {
  const per = {}
  for (const r of rows) if (r.answers && !r.refused) ((per[r.twin] ??= {})[r.repeat] ??= []).push(r.answers)
  return Object.fromEntries(Object.entries(per).map(([twin, reps]) => [twin, averageAnswers(Object.values(reps).map((xs) => Object.assign({}, ...xs)))]))
}

/** Each round's predicted level per case; a case with no completed production round stays unpredicted. */
export function predict(d, answers, ids) {
  const frozen = new Map(d.frozenStates.map((s) => [s.twin, s]))
  return d.control.map((ctl, i) => {
    const out = {}
    for (const id of ids) {
      if (ctl[id]?.status !== 'completed' || !d.inputs[i][id]) continue
      const [, , , slices, files, statuses, testsNotRequired] = d.inputs[i][id]
      const groups = []
      let failed = 0
      for (const b of d.bindings.filter((x) => x.side === `r${i + 1}` && x.id === id)) {
        const s = frozen.get(b.twin)
        if (!s || s.skip) continue
        const g = answers[b.twin] && factorGroup(answers[b.twin], s.testOnly, b.sliceIndex ?? undefined)
        if (g) groups.push(g)
        else failed++
      }
      if (failed && !groups.length) out[id] = { level: ctl[id].predicted, scorer: 'two-axis fallback' }
      else {
        const score = scoreFactors(groups, { slices, files, statuses, testsNotRequired, context: d.prs[id]?.body ?? '' })
        out[id] = { level: LEVELS[score.rank], scorer: 'factors', credited: score.groups.some((g) => g.credit), partial: failed > 0 }
      }
    }
    return out
  })
}

const costOf = (x) => (x < 0 ? -2 * x : x)
const predOf = (round, id) => round[id]?.level ?? 'medium'

export function metrics(rounds, labels) {
  const n = labels.reduce((s, l) => s + l.weight, 0) * rounds.length
  const sum = (f) => rounds.reduce((s, r) => s + labels.reduce((t, l) => t + l.weight * f(LEVELS.indexOf(predOf(r, l.id)) - LEVELS.indexOf(l.level), l), 0), 0)
  return {
    n: labels.length,
    cost: sum(costOf) / n,
    exact: sum((x) => +(x === 0)) / n,
    over: sum((x) => +(x > 0)) / n,
    under: sum((x) => +(x < 0)) / n,
    dangerousW: sum((x, l) => +(LEVELS.indexOf(l.level) >= 2 && x < 0)) / rounds.length,
  }
}

/** Paired difference in cost, candidate minus base, with a repository-clustered bootstrap 95% interval. */
export function pairedCI(base, cand, labels, repoOf) {
  const caseCost = (rounds, l) => rounds.reduce((s, r) => s + costOf(LEVELS.indexOf(predOf(r, l.id)) - LEVELS.indexOf(l.level)), 0) / rounds.length
  const delta = new Map(labels.map((l) => [l, caseCost(cand, l) - caseCost(base, l)]))
  const clusters = [...new Set(labels.map((l) => repoOf[l.id]))]
  const byCluster = Object.fromEntries(clusters.map((c) => [c, labels.filter((l) => repoOf[l.id] === c)]))
  const stat = (sample) => {
    let num = 0, den = 0
    for (const c of sample) for (const l of byCluster[c]) { num += l.weight * delta.get(l); den += l.weight }
    return den ? num / den : 0
  }
  let seed = 11
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const boot = Array.from({ length: B }, () => stat(clusters.map(() => clusters[Math.floor(rand() * clusters.length)]))).sort((a, b) => a - b)
  return { delta: stat(clusters), ci95: [boot[Math.floor(B * 0.025)], boot[Math.floor(B * 0.975) - 1]], clusters: clusters.length }
}

async function sendAll(requests, model, name) {
  const key = name === 'gemini' ? process.env.GEMINI_DECISIONS_API_KEY || process.env.GEMINI_API_KEY : process.env.TYPESAFE_API_KEY
  if (!key) throw new Error(`${name === 'gemini' ? 'GEMINI_DECISIONS_API_KEY or GEMINI_API_KEY' : 'TYPESAFE_API_KEY'} required for --live`)
  const backend = backendFor(name, key, { url: endpointUrl(undefined), model })
  const rows = []
  const usage = { requests: 0, inputTokens: 0, outputTokens: 0, failed: 0 }
  const latencies = []
  const queue = [...requests]
  const one = async (req) => {
    for (let attempt = 0; ; attempt++) {
      usage.requests++
      const started = Date.now()
      let res, text
      try {
        res = await fetch(backend.url, { ...requestInit(backend, req.body), redirect: 'error', signal: AbortSignal.timeout(120_000) })
        text = readResponse(backend, { ok: res.ok, text: await res.text() }).text
      } catch {
        if (attempt < RETRIES) continue
        return { failed: true }
      }
      latencies.push(Date.now() - started)
      if (tooLong(backend, { status: res.status, text })) return { refused: true }
      if ((res.status === 429 || res.status >= 500) && attempt < RETRIES) { await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); continue }
      if (!res.ok) return { failed: true }
      const data = JSON.parse(text)
      if (data.model != null && data.model !== backend.model) throw new Error('model mismatch: ' + data.model)
      usage.inputTokens += data.usage?.input_tokens ?? data.usage?.total_input_tokens ?? 0
      usage.outputTokens += data.usage?.output_tokens ?? data.usage?.total_output_tokens ?? 0
      return { answers: data.answers ?? {} }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const req = queue.shift()
      const out = await one(req)
      if (out.failed) usage.failed++
      rows.push({ twin: req.twin, repeat: req.repeat, ...out })
    }
  }))
  latencies.sort((a, b) => a - b)
  const q = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] ?? null
  return { rows, usage: { ...usage, latencyMs: { p50: q(0.5), p95: q(0.95) } } }
}

function liveRequests(d, ids, model) {
  const tests = testsOfCases(d.bindings)
  const wanted = new Set(ids)
  const out = []
  for (const b of firstPerTwin(d.bindings.filter((x) => wanted.has(x.id)))) {
    const built = factorBodies(model, b.state, tests[b.id])
    if (!built) continue
    for (let repeat = 1; repeat <= FACTOR_REPEATS; repeat++) for (const body of built.bodies) out.push({ twin: b.twin, repeat, body })
  }
  return out
}

const gitSha = () => spawnSync('git', ['rev-parse', 'HEAD'], { cwd: HERE, encoding: 'utf8' }).stdout.trim()

function summarize(rounds, d, ids, base, repoOf) {
  const keep = new Set(ids)
  const views = {}
  for (const view of [...new Set(d.labels.map((l) => l.view))].sort()) {
    const ls = d.labels.filter((l) => l.view === view && keep.has(l.id))
    views[view] = { ...metrics(rounds, ls), vsBase: pairedCI(base, rounds, ls, repoOf) }
  }
  return views
}

async function main() {
  const { values } = parseArgs({ options: {
    replay: { type: 'boolean' }, live: { type: 'boolean' }, data: { type: 'string' }, limit: { type: 'string' }, model: { type: 'string' }, backend: { type: 'string', default: 'typesafe' },
  } })
  if (!values.replay === !values.live) throw new Error('pass exactly one of --replay or --live')
  if (!['typesafe', 'gemini'].includes(values.backend)) throw new Error('--backend must be typesafe or gemini')
  const dir = resolve(values.data ?? join(HERE, 'local/data/v8'))
  if (!existsSync(join(dir, 'labels.jsonl'))) throw new Error(`no data in ${dir}: run data.mjs pull v8 first`)
  const d = loadSet(dir)
  const repoOf = Object.fromEntries(d.roster.map((r) => [r.id, r.repo]))
  const allIds = d.roster.map((r) => r.id).sort()
  const ids = values.limit ? allIds.slice(0, Number(values.limit)) : allIds
  const recorded = predict(d, answersOf(d.result.rows), ids)
  const report = { createdAt: new Date().toISOString(), git: gitSha(), data: dir, cases: ids.length, questions: sha(JSON.stringify(d.plan.requests.map((r) => r.sha256))) }

  if (values.replay) {
    const port = portCheck(d)
    const views = summarize(recorded, d, ids, d.control.map((r) => Object.fromEntries(Object.entries(r).map(([id, x]) => [id, { level: x.status === 'completed' ? x.predicted : undefined }]))), repoOf)
    const expected = Object.fromEntries(Object.entries(d.baseline.views).map(([v, byBlock]) => [v, byBlock.all.FE.cost]))
    const costMatches = Object.entries(expected).every(([v, c]) => Math.abs(views[v].cost - c) < 1e-12)
    Object.assign(report, { mode: 'replay', model: d.plan.model, port, expectedCost: expected, views, pass: port.states === 0 && port.bodies === 0 && costMatches })
  } else {
    const model = values.backend === 'gemini' ? GEMINI_MODEL : values.model ?? DEFAULT_MODEL
    const requests = liveRequests(d, ids, model)
    const started = Date.now()
    const { rows, usage } = await sendAll(requests, model, values.backend)
    const live = predict(d, answersOf(rows), ids)
    Object.assign(report, { mode: 'live', backend: values.backend, model, usage: { ...usage, wallMs: Date.now() - started }, views: summarize(live, d, ids, recorded, repoOf),
      recorded: summarize(recorded, d, ids, recorded, repoOf) })
  }

  const out = join(HERE, '../.results/pr-risk')
  mkdirSync(out, { recursive: true })
  const file = join(out, `fe-${report.mode}-${report.createdAt.replace(/[:.]/g, '-')}.json`)
  writeFileSync(file, JSON.stringify(report, null, 1) + '\n')
  for (const [v, m] of Object.entries(report.views))
    console.log(`view ${v}: n ${m.n} cost ${m.cost.toFixed(3)} exact ${(m.exact * 100).toFixed(1)}% over ${(m.over * 100).toFixed(1)}% under ${(m.under * 100).toFixed(1)}% dangerousW ${m.dangerousW.toFixed(1)} Δ ${m.vsBase.delta.toFixed(3)} [${m.vsBase.ci95.map((x) => x.toFixed(3)).join(', ')}]`)
  if (report.port) console.log(`port: ${report.port.checked} states, ${report.port.states} state and ${report.port.bodies} body mismatches; expected cost ${JSON.stringify(report.expectedCost)}`)
  if (report.usage) console.log(`usage: ${JSON.stringify(report.usage)}`)
  console.log(`${report.pass === false ? 'FAIL' : 'ok'} → ${file}`)
  if (report.pass === false) process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
