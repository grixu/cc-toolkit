#!/usr/bin/env node
// Scores recorded story-gate answers against the owner's labels and picks thresholds that never skip a `story` PR.
//
//   node plugins/dev-kit/evals/story-gate/metrics.mjs <answers.jsonl>... [--labels <labels.jsonl>] [--thresholds 0.8,0.9]
//
// Several answer files are averaged per PR, as the tool averages Jev and Gemini. --thresholds scores a holdout at
// thresholds frozen from the dev set, fitting nothing to it.
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { SKIP_FACTS, STORY_FACTS, decide } from '../../hooks/story.ts'

const readJsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))

// A PR that failed in any run fails; a too-large PR always gets a story, as in the tool.
export function combineRuns(runs) {
  return runs[0].map((first) => {
    const all = runs.map((r) => r.find((a) => a.id === first.id))
    const failed = all.findIndex((a) => !a?.ok)
    if (failed !== -1) return all[failed] ?? { id: first.id, ok: false, error: 'missing in a run' }
    if (first.tooLarge) return first
    const facts = Object.fromEntries(Object.keys(first.facts).map((k) => [k, all.reduce((s, a) => s + a.facts[k], 0) / all.length]))
    return { ...first, facts }
  })
}

export const skipped = (c, t) => !c.tooLarge && !decide(c.facts, t).story

export function auc(pos, neg) {
  if (!pos.length || !neg.length) return NaN
  let wins = 0
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0
  return wins / (pos.length * neg.length)
}

const GRID_SKIP = Array.from({ length: 19 }, (_, i) => +(0.5 + i * 0.025).toFixed(3))
const GRID_STORY = [...Array.from({ length: 14 }, (_, i) => +(0.3 + i * 0.05).toFixed(2)), 1.01]

// Zero `story` PRs skipped is a hard limit; among the thresholds that hold it, the most skips win, then the highest
// skipAt (the widest margin to the nearest story PR), then the highest storyAt.
export function fit(train) {
  let best
  for (const skipAt of GRID_SKIP)
    for (const storyAt of GRID_STORY) {
      const t = { skipAt, storyAt }
      if (train.some((c) => c.label === 'story' && skipped(c, t))) continue
      const skips = train.filter((c) => c.label === 'skip' && skipped(c, t)).length
      if (!best || skips > best.skips || (skips === best.skips && (skipAt > best.t.skipAt || (skipAt === best.t.skipAt && storyAt > best.t.storyAt)))) best = { t, skips }
    }
  return best?.t ?? { skipAt: 1.01, storyAt: 0 }
}

export function tally(cases, t) {
  const of = (label) => cases.filter((c) => c.label === label)
  return {
    skips: of('skip').filter((c) => skipped(c, t)).length,
    skipTotal: of('skip').length,
    storySkipped: of('story').filter((c) => skipped(c, t)).length,
    storyTotal: of('story').length,
  }
}

export function leaveOneOut(cases) {
  const misses = []
  let skips = 0
  let storySkipped = 0
  for (const c of cases) {
    const s = skipped(c, fit(cases.filter((o) => o !== c)))
    if (s && c.label === 'story') storySkipped++, misses.push(`${c.id} skipped (story)`)
    if (s && c.label === 'skip') skips++
    if (!s && c.label === 'skip') misses.push(`${c.id} kept (skip)`)
  }
  return { skips, storySkipped, misses }
}

function main() {
  const { values: args, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      labels: { type: 'string', default: path.join(import.meta.dirname, 'local/labels.jsonl') },
      thresholds: { type: 'string' },
    },
  })
  if (!positionals.length) throw new Error('usage: metrics.mjs <answers.jsonl>...')

  const labels = new Map(readJsonl(args.labels).map((l) => [l.id, l]))
  const unconfirmed = [...labels.values()].filter((l) => !l.confirmed).length
  if (unconfirmed) console.log(`WARNING: ${unconfirmed} labels are not confirmed by the owner; numbers are provisional.\n`)
  if (positionals.length > 1) console.log(`Averaging ${positionals.length} runs.\n`)

  const cases = combineRuns(positionals.map(readJsonl)).flatMap((a) => {
    const l = labels.get(a.id)
    if (!l) return []
    return [a.ok ? { id: a.id, label: l.label, tooLarge: !!a.tooLarge, facts: a.facts } : { id: a.id, label: l.label, error: a.error }]
  })
  const failed = cases.filter((c) => c.error)
  const scored = cases.filter((c) => !c.error && c.label !== 'borderline')
  const count = (label) => cases.filter((c) => c.label === label).length
  console.log(`Cases: ${cases.length} (story ${count('story')}, skip ${count('skip')}, borderline ${count('borderline')}), failed ${failed.length}, too large ${scored.filter((c) => c.tooLarge).length}\n`)

  const by = (label) => scored.filter((c) => c.label === label && !c.tooLarge)
  console.log('Per-fact AUC (skip facts: skip vs story; story facts: story vs skip)')
  for (const k of Object.keys(SKIP_FACTS)) console.log(`  ${k.padEnd(26)} ${auc(by('skip').map((c) => c.facts[k]), by('story').map((c) => c.facts[k])).toFixed(2)}`)
  for (const k of Object.keys(STORY_FACTS)) console.log(`  ${k.padEnd(26)} ${auc(by('story').map((c) => c.facts[k]), by('skip').map((c) => c.facts[k])).toFixed(2)}`)

  const frozen = args.thresholds?.split(',').map(Number)
  const t = frozen ? { skipAt: frozen[0], storyAt: frozen[1] } : fit(scored)
  const r = tally(scored, t)
  console.log(`\n${frozen ? 'Frozen' : 'Fitted'} thresholds: skipAt ${t.skipAt}, storyAt ${t.storyAt > 1 ? 'off' : t.storyAt}`)
  console.log(`  ${r.skips}/${r.skipTotal} skip-labelled PRs skipped, ${r.storySkipped}/${r.storyTotal} story PRs skipped`)
  if (!frozen) {
    const loo = leaveOneOut(scored)
    console.log(`Leave-one-out: ${loo.skips}/${r.skipTotal} skip-labelled PRs skipped, ${loo.storySkipped} story PRs skipped`)
    for (const m of loo.misses) console.log(`  ${m}`)
  }

  console.log('\nPer PR (facts, decision at those thresholds)')
  const keys = [...Object.keys(SKIP_FACTS), ...Object.keys(STORY_FACTS)]
  for (const c of scored) {
    const f = c.tooLarge ? 'too large' : keys.map((k) => `${k.split('_').map((w) => w[0]).join('')} ${c.facts[k].toFixed(2)}`).join(' · ')
    console.log(`  ${(skipped(c, t) ? 'SKIP ' : 'story').padEnd(6)} ${c.label.padEnd(6)} ${c.id.padEnd(40)} ${f}`)
  }
  for (const c of failed) console.log(`  FAILED ${c.id}: ${c.error}`)
}

if (import.meta.main) main()
