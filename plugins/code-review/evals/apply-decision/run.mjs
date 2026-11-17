#!/usr/bin/env node
// Sends every recorded walk decision through applyDecisionRequest to Jev or Gemini Decision and records the answers.
//
//   node plugins/code-review/evals/apply-decision/run.mjs --backend typesafe --tag baseline [--limit 20]
//
// Keys: TYPESAFE_API_KEY, or GEMINI_DECISIONS_API_KEY / GEMINI_API_KEY. Output: evals/.results/apply-decision/<tag>/.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { applyDecisionRequest } from '../../hooks/apply-decision.ts'
import { DecisionError, ask, limiter } from '../../hooks/decision.ts'
import { createProvider } from '../../hooks/providers/index.ts'
import { loadCases } from './cases.mjs'

const HERE = import.meta.dirname

const { values: args } = parseArgs({
  options: {
    backend: { type: 'string', default: 'typesafe' },
    data: { type: 'string', default: path.join(HERE, 'local/decisions.code.jsonl') },
    tag: { type: 'string', default: new Date().toISOString().replace(/[:.]/g, '-') },
    limit: { type: 'string' },
    concurrency: { type: 'string', default: '4' },
    'all-types': { type: 'boolean', default: false },
    proposal: { type: 'string', default: 'bullet' },
  },
})

if (!['typesafe', 'gemini'].includes(args.backend)) throw new Error('--backend must be typesafe or gemini')
if (!['bullet', 'walk'].includes(args.proposal)) throw new Error('--proposal must be bullet or walk')
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

let cases = loadCases(args.data, { allTypes: args['all-types'], proposal: args.proposal })
if (args.limit) cases = cases.slice(0, Number(args.limit))

const outDir = path.join(HERE, '../.results/apply-decision', args.tag)
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, `answers.${args.backend}.jsonl`)
const out = fs.createWriteStream(outFile)
const limit = limiter(Number(args.concurrency))
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex')

let done = 0
let failed = 0
await Promise.all(
  cases.map(async (c) => {
    const request = applyDecisionRequest(c.finding, c.review)
    const body = provider.encode(request).init.body
    const started = Date.now()
    let record
    try {
      const response = await ask($, provider, request, limit)
      record = { id: c.id, label: c.label, ok: true, model: response.model, answers: response.answers }
    } catch (e) {
      failed++
      record = { id: c.id, label: c.label, ok: false, error: e instanceof DecisionError ? `${e.kind}: ${e.message}` : String(e) }
    }
    out.write(JSON.stringify({ ...record, backend: args.backend, ms: Date.now() - started, requestSha256: sha256(body), inputChars: JSON.stringify(request.input).length }) + '\n')
    if (++done % 20 === 0) console.error(`${done}/${cases.length}`)
  }),
)
out.end()
fs.writeFileSync(
  path.join(outDir, 'run.json'),
  JSON.stringify({ backend: args.backend, model: provider.model, proposal: args.proposal, data: path.relative(HERE, args.data), cases: cases.length, failed, at: new Date().toISOString() }, null, 2) + '\n',
)
console.log(`${cases.length} cases, ${failed} failed → ${path.relative(process.cwd(), outFile)}`)
