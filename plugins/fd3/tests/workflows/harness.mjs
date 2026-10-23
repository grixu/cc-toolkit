import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const WORKFLOWS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'workflows')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const GLOBALS = ['args', 'agent', 'parallel', 'pipeline', 'phase', 'log']

// A workflow script is a module only by its `meta` export; the runtime evaluates the rest as an async
// function body with top-level `return`, which is what this reproduces.
export const loadWorkflow = (name) => {
  const source = readFileSync(join(WORKFLOWS_DIR, name), 'utf8').replace(/^export const meta/m, 'const meta')
  return new AsyncFunction(...GLOBALS, source)
}

// The scripts declare their schemas as local constants, so a call is named by its schema's required
// keys — the one part of a schema a refactor cannot change without changing what the agent returns.
const SCHEMA_NAMES = {
  commands: 'BASELINE_RESULT',
  'toolchain,baseline': 'HANDOVER_RESULT',
  'slug,outcome,summary': 'IMPLEMENT_RESULT',
  branches: 'MERGE_RESULT',
  'passed,failures,branch,dirty,head': 'CI_RESULT',
  marked: 'MARK_RESULT',
  'summary,fromSha,toSha': 'FIX_RESULT',
  'status,invoked,files': 'PREP_RESULT',
  'status,invoked,filesJudged,filesTotal': 'SCAN_RESULT',
  'invoked,lenses': 'SCAN_ALL_RESULT',
  'status,invoked,findings': 'CR_MERGE_RESULT',
  touched: 'TOOLCHAIN_TOUCH_RESULT',
  refreshed: 'REFRESH_RESULT',
  'outcome,summary,fromSha': 'REPAIR_RESULT',
  'checked,findings': 'CONFORMANCE_RESULT',
}
export const schemaName = (schema) => {
  if (!schema) return null
  const key = (schema.required || []).join(',')
  return SCHEMA_NAMES[key] || `schema(${key})`
}

// Only required keys are checked: the scripts normalise decorated enum tokens on purpose, so a
// scenario must be able to return a value the schema's enum would reject.
const missingRequired = (schema, value, path = '$') => {
  if (!schema || value === null || value === undefined) return []
  if (schema.type === 'array' && Array.isArray(value)) return value.flatMap((v, i) => missingRequired(schema.items, v, `${path}[${i}]`))
  if (typeof value !== 'object' || Array.isArray(value)) return []
  const own = (schema.required || []).filter((k) => !(k in value)).map((k) => `${path}.${k}`)
  const nested = Object.entries(schema.properties || {}).flatMap(([k, s]) => (k in value ? missingRequired(s, value[k], `${path}.${k}`) : []))
  return [...own, ...nested]
}

const matches = (pattern, label) => (pattern instanceof RegExp ? pattern.test(label) : label === pattern || label.startsWith(pattern))

// rules: [[pattern, reply], ...] — the first rule whose pattern matches the label answers. A string
// pattern matches the exact label or any label it prefixes; a RegExp is tested against the label. A
// reply is a value (null simulates an agent that died) or a function (prompt, opts, callIndex) whose
// callIndex counts this rule's earlier matches. A label no rule matches fails the run, and so does a
// reply missing a key its schema requires — unless checkSchemas is false, for a scenario that
// simulates an agent breaking its schema.
export const runWorkflow = async (name, args, rules, { checkSchemas = true } = {}) => {
  const calls = []
  const logs = []
  const phases = []
  const unmatched = []
  const schemaErrors = []
  const hits = new Map()
  let currentPhase = null

  const agent = async (prompt, opts = {}) => {
    const label = opts.label
    const call = {
      label,
      phase: opts.phase ?? null,
      runPhase: currentPhase,
      model: opts.model ?? null,
      effort: opts.effort ?? null,
      agentType: opts.agentType ?? null,
      schema: schemaName(opts.schema),
      prompt,
      opts,
    }
    calls.push(call)
    const index = rules.findIndex(([pattern]) => matches(pattern, label))
    if (index === -1) {
      unmatched.push(label)
      throw new Error(`unscripted agent call: ${label}`)
    }
    const n = hits.get(index) || 0
    hits.set(index, n + 1)
    const reply = rules[index][1]
    const result = typeof reply === 'function' ? await reply(prompt, opts, n) : reply
    call.result = result
    for (const p of missingRequired(opts.schema, result)) schemaErrors.push(`${label}: reply lacks ${p}`)
    return structuredClone(result)
  }
  const parallel = (thunks) => Promise.all(thunks.map((f) => f()))
  const pipeline = async (steps, initial) => {
    let value = initial
    for (const step of steps) value = await step(value)
    return value
  }
  const phase = (title) => {
    currentPhase = title
    phases.push(title)
  }
  const log = (message) => logs.push(message)

  const result = await loadWorkflow(name)(args, agent, parallel, pipeline, phase, log)
  // A script can absorb a thrown agent call (the baseline pass does), so an unscripted label is
  // re-raised here, where no script can swallow it.
  if (unmatched.length > 0) throw new Error(`unscripted agent call(s): ${unmatched.join(', ')}`)
  if (checkSchemas && schemaErrors.length > 0) throw new Error(`scenario replies break their schemas:\n${schemaErrors.join('\n')}`)
  return new Run(result, calls, logs, phases)
}

export class Run {
  constructor(result, calls, logs, phases) {
    Object.assign(this, { result, calls, logs, phases })
  }

  get labels() {
    return this.calls.map((c) => c.label)
  }

  // Exact label, or the only call whose label it prefixes when no call has it exactly.
  call(label) {
    const exact = this.calls.find((c) => c.label === label)
    if (exact) return exact
    const found = this.calls.filter((c) => matches(label, c.label))
    if (found.length !== 1) throw new Error(`expected one call for ${label}, found ${found.length}: ${this.labels.join(', ')}`)
    return found[0]
  }

  callsMatching(pattern) {
    return this.calls.filter((c) => matches(pattern, c.label))
  }

  has(pattern) {
    return this.calls.some((c) => matches(pattern, c.label))
  }
}

// Replies that differ per call of the same rule: the nth call gets the nth reply, and every call past
// the list gets the last one.
export const seq = (...replies) => (prompt, opts, n) => {
  const r = replies[Math.min(n, replies.length - 1)]
  return typeof r === 'function' ? r(prompt, opts, n) : r
}
