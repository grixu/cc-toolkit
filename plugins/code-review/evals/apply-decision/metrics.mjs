#!/usr/bin/env node
// Scores recorded answers against the owner's labels.
//
//   node plugins/code-review/evals/apply-decision/metrics.mjs evals/.results/apply-decision/<tag>/answers.typesafe.jsonl
//
// A case counts as positive when the owner applied the fix as proposed; skip, alternative, conditional and clarify
// are negatives, since each needed the owner. Reports the policy's automation rate (fixes applied without asking),
// its wrong auto-applies (negatives it applied) and the share of negatives it routed to the owner.
import fs from 'node:fs'
import { parseArgs } from 'node:util'
import { THRESHOLDS, walkDecision } from '../../hooks/apply-decision.ts'

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    budget: { type: 'string', default: '0,1,2' },
    bootstrap: { type: 'string', default: '2000' },
    'high-confidence': { type: 'boolean', default: false },
    json: { type: 'string' },
  },
})
if (!positionals.length) throw new Error('usage: metrics.mjs <answers.jsonl>')

const records = positionals.flatMap((file) =>
  fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)),
)
const runOf = (id) => id.split(':')[0]
const backends = new Set(records.map((r) => r.backend))
if (backends.size !== 1) throw new Error('score one backend at a time; thresholds differ between them')
const DEFAULT_THRESHOLDS = THRESHOLDS[[...backends][0]]
let cases = records.map((r) => ({ id: r.id, run: runOf(r.id), positive: r.label === 'apply', label: r.label, ok: r.ok, answers: r.answers ?? {} }))
if (args['high-confidence']) {
  const data = new Map(
    fs.readFileSync(new URL('./local/decisions.code.jsonl', import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => {
      const d = JSON.parse(l)
      return [`${d.run}:${d.ask_id.slice(-8)}:${d.option ?? d.header}`, d.confidence]
    }),
  )
  cases = cases.filter((c) => data.get(c.id.replace(/#\d+$/, '')) !== 'low')
}

const decide = (c, t) => (c.ok ? walkDecision(c.answers, t).decision : 'ask')

function score(list, t) {
  let auto = 0
  let wrong = 0
  let negatives = 0
  let negativesAsked = 0
  for (const c of list) {
    const d = decide(c, t)
    if (!c.positive) negatives++
    if (d === 'apply') {
      auto++
      if (!c.positive) wrong++
    } else if (!c.positive) negativesAsked++
  }
  return { n: list.length, auto, wrong, automation: auto / list.length, negatives, negativeRecall: negatives ? negativesAsked / negatives : null }
}

// Area under the ROC curve of the policy's score, the larger of the two gate probabilities, apply against the rest.
const gateScore = (c) => -Math.max(c.answers.needs_owner_facts?.p ?? 1, c.answers.remedy_choice?.p ?? 1)
function auc(list) {
  const pos = list.filter((c) => c.ok && c.positive).map(gateScore)
  const neg = list.filter((c) => c.ok && !c.positive).map(gateScore)
  if (!pos.length || !neg.length) return null
  let wins = 0
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0
  return wins / (pos.length * neg.length)
}

const STEPS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 1.01]
const GRID = STEPS.flatMap((facts) => STEPS.map((remedy) => ({ facts, remedy })))

// The thresholds with the most automation whose wrong auto-applies stay within `budget`; ties go to the stricter grid point.
function tune(list, budget) {
  let best = null
  for (const t of GRID) {
    const s = score(list, t)
    if (s.wrong > budget) continue
    if (!best || s.auto > best.s.auto) best = { t, s }
  }
  return best
}

// Leave one run out: tune on the other runs, decide the held-out run's cases, and add up.
function crossValidated(list, budget) {
  const runs = [...new Set(list.map((c) => c.run))]
  let auto = 0
  let wrong = 0
  for (const run of runs) {
    const best = tune(list.filter((c) => c.run !== run), budget)
    if (!best) continue
    for (const c of list.filter((x) => x.run === run))
      if (decide(c, best.t) === 'apply') {
        auto++
        if (!c.positive) wrong++
      }
  }
  return { auto, wrong, automation: auto / list.length }
}

function bootstrap(list, fn, rounds) {
  const byRun = new Map()
  for (const c of list) byRun.set(c.run, [...(byRun.get(c.run) ?? []), c])
  const runs = [...byRun.keys()]
  let seed = 7
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const values = []
  for (let i = 0; i < rounds; i++) {
    const sample = Array.from({ length: runs.length }, () => byRun.get(runs[Math.floor(rand() * runs.length)])).flat()
    values.push(fn(sample))
  }
  values.sort((a, b) => a - b)
  return [values[Math.floor(rounds * 0.025)], values[Math.floor(rounds * 0.975)]]
}

const pct = (x) => (x === null || x === undefined ? '—' : `${(100 * x).toFixed(1)}%`)
const failed = cases.filter((c) => !c.ok).length
const labels = Object.entries(cases.reduce((o, c) => ({ ...o, [c.label]: (o[c.label] ?? 0) + 1 }), {}))
const rounds = Number(args.bootstrap)

console.log(`cases ${cases.length} (runs ${new Set(cases.map((c) => c.run)).size}, failed requests ${failed}) · labels ${labels.map(([k, v]) => `${k} ${v}`).join(', ')}`)
console.log(`AUC of max(needs_owner_facts, remedy_choice) (apply vs the rest): ${auc(cases)?.toFixed(3) ?? '—'}`)

console.log('\nMean answer by label (apply / the rest):')
for (const key of [...new Set(cases.flatMap((c) => Object.keys(c.answers)))]) {
  const v = (c) => (c.answers[key]?.type === 'binary' ? c.answers[key].p : c.answers[key]?.expected)
  const mean = (l) => {
    const xs = l.map(v).filter((x) => Number.isFinite(x))
    return xs.length ? (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(2) : '—'
  }
  console.log(`  ${key.padEnd(18)} ${mean(cases.filter((c) => c.positive))} / ${mean(cases.filter((c) => !c.positive))}`)
}

const negatives = cases.filter((c) => !c.positive).length
const rows = [
  ['always apply', { automation: 1, wrong: negatives, negativeRecall: 0 }],
  ['always ask', { automation: 0, wrong: 0, negativeRecall: 1 }],
  ['default thresholds', score(cases, DEFAULT_THRESHOLDS)],
]
const summary = { cases: cases.length, failed, auc: auc(cases), default: score(cases, DEFAULT_THRESHOLDS), budgets: {} }
for (const budget of args.budget.split(',').map(Number)) {
  const best = tune(cases, budget)
  const cv = crossValidated(cases, budget)
  if (best) rows.push([`tuned, ≤${budget} wrong (in-sample)`, best.s])
  rows.push([`tuned, ≤${budget} wrong (leave-one-run-out)`, { ...cv, negativeRecall: negatives ? 1 - cv.wrong / negatives : null }])
  summary.budgets[budget] = { inSample: best, crossValidated: cv }
}

console.log('\n| Policy | Automation | Wrong auto-applies | Negatives asked |')
console.log('|---|---|---|---|')
for (const [name, s] of rows) console.log(`| ${name} | ${pct(s.automation)} | ${s.wrong} | ${pct(s.negativeRecall)} |`)

const [lo, hi] = bootstrap(cases, (l) => score(l, DEFAULT_THRESHOLDS).automation, rounds)
console.log(`\nDefault thresholds, automation 95% CI (bootstrap by run): ${pct(lo)} – ${pct(hi)}`)
for (const budget of Object.keys(summary.budgets)) {
  const t = summary.budgets[budget].inSample?.t
  if (t) console.log(`Thresholds tuned at ≤${budget}: ${JSON.stringify(t)}`)
}
if (args.json) fs.writeFileSync(args.json, JSON.stringify(summary, null, 2) + '\n')
