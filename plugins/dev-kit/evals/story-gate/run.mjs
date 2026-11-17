#!/usr/bin/env node
// Asks Jev or Gemini Decision the story gate's facts for every PR in local/states.jsonl and records the answers.
//
//   node plugins/dev-kit/evals/story-gate/run.mjs --backend typesafe --tag baseline
//
// Keys: TYPESAFE_API_KEY, or GEMINI_DECISIONS_API_KEY / GEMINI_API_KEY. Output: evals/.results/story-gate/<tag>/.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { DecisionError, ask, limiter } from '../../hooks/decision.ts'
import { createProvider } from '../../hooks/providers/index.ts'
import { aggregateFacts, missingFact, storyQuestions } from '../../hooks/story.ts'

const HERE = import.meta.dirname

const { values: args } = parseArgs({
  options: {
    backend: { type: 'string', default: 'typesafe' },
    data: { type: 'string', default: path.join(HERE, 'local/states.jsonl') },
    tag: { type: 'string', default: new Date().toISOString().replace(/[:.]/g, '-') },
    concurrency: { type: 'string', default: '4' },
  },
})

if (!['typesafe', 'gemini'].includes(args.backend)) throw new Error('--backend must be typesafe or gemini')
const keys = {
  typesafe: process.env.TYPESAFE_API_KEY ?? '',
  gemini: process.env.GEMINI_DECISIONS_API_KEY || process.env.GEMINI_API_KEY || '',
}
if (!keys[args.backend]) throw new Error(`no key for ${args.backend} in the environment`)
const provider = createProvider(args.backend, keys, {})

const $ = {
  http: {
    fetch: async (url, init) => {
      const res = await fetch(url, init)
      return { ok: res.ok, status: res.status, headers: Object.fromEntries(res.headers), text: await res.text() }
    },
  },
  process: { run: async ([, seconds]) => new Promise((resolve) => setTimeout(() => resolve({ code: 0 }), Number(seconds) * 1000)) },
}

const prs = fs.readFileSync(args.data, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const outDir = path.join(HERE, '../.results/story-gate', args.tag)
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, `answers.${args.backend}.jsonl`)
const limit = limiter(Number(args.concurrency))
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex')
const questions = storyQuestions()

let failed = 0
const records = await Promise.all(
  prs.map(async (pr) => {
    if (pr.tooLarge) return { id: pr.id, ok: true, tooLarge: true }
    const started = Date.now()
    try {
      const parts = await Promise.all(
        pr.states.map(async (input) => {
          const request = { input, questions }
          const response = await ask($, provider, request, limit)
          const missing = missingFact(response.answers)
          if (missing) throw new Error(`no answer for ${missing}`)
          return { model: response.model, answers: response.answers, requestSha256: sha256(provider.encode(request).init.body) }
        }),
      )
      return { id: pr.id, ok: true, model: parts[0].model, facts: aggregateFacts(parts.map((p) => p.answers)), parts, ms: Date.now() - started }
    } catch (e) {
      failed++
      return { id: pr.id, ok: false, error: e instanceof DecisionError ? `${e.kind}: ${e.message}` : String(e) }
    }
  }),
)
fs.writeFileSync(outFile, records.map((r) => JSON.stringify({ ...r, backend: args.backend })).join('\n') + '\n')
fs.writeFileSync(
  path.join(outDir, `run.${args.backend}.json`),
  JSON.stringify({ backend: args.backend, model: provider.model, data: path.basename(args.data), prs: prs.length, failed, at: new Date().toISOString(), questions }, null, 2) + '\n',
)
console.log(`${prs.length} PRs, ${failed} failed → ${path.relative(process.cwd(), outFile)}`)
