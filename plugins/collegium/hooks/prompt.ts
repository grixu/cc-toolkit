import { isObject, withoutTrailingSlash } from './harness.ts'

export const PREAMBLE =`You run unattended: nobody will answer a question. Never ask one. When something is unclear,
choose, and record the choice under assumptions. If you truly cannot continue, finish with
status "blocked" and say why in summary. User questions and Claude Code subagents are not
available here. Your final message is JSON in the given schema.`

type Schema = Record<string, unknown>

type Fs = {
  read: (path: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
}

export type RunInput = {
  task: string
  skill?: string
  resultSchema?: Schema
}

export type PreparedRun = { promptPath: string; schemaPath: string } | { error: string }

export const ENVELOPE_STATUSES = ['done', 'blocked', 'failed'] as const

export function envelopeSchema(resultSchema?: Schema): Schema {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['status', 'summary', 'result', 'assumptions', 'open_questions'],
    properties: {
      status: { type: 'string', enum: ENVELOPE_STATUSES },
      summary: { type: 'string' },
      result: resultSchema ?? { type: ['string', 'null'] },
      assumptions: { type: 'array', items: { type: 'string' } },
      open_questions: { type: 'array', items: { type: 'string' } },
    },
  }
}

const FORBIDDEN = ['allOf', 'not', 'if', 'then', 'else'] as const

// Codex only parses --output-schema as JSON, so a schema that breaks OpenAI strict mode
// would fail at the API after launch; this catches it first and names the rule.
export function checkStrictSchema(schema: unknown): string | null {
  if (!isObject(schema) || schema.type !== 'object') return 'result_schema: the root must be { "type": "object" }'
  return checkNode(schema, 'result_schema')
}

/** The caller-facing error for a result_schema that breaks strict mode, or null when it is usable. */
export function resultSchemaError(schema: unknown): string | null {
  const broken = checkStrictSchema(schema)
  return broken ? `invalid result_schema (${broken})` : null
}

function checkNode(node: unknown, at: string): string | null {
  if (Array.isArray(node)) {
    for (const [i, item] of node.entries()) {
      const broken = checkNode(item, `${at}[${i}]`)
      if (broken) return broken
    }
    return null
  }
  if (!isObject(node)) return null
  for (const key of FORBIDDEN) {
    if (key in node) return `${at}: "${key}" is not allowed in a strict schema`
  }
  if (isObjectSchema(node)) {
    if (node.additionalProperties !== false) return `${at}: an object needs "additionalProperties": false`
    const keys = Object.keys(isObject(node.properties) ? node.properties : {})
    const required = Array.isArray(node.required) ? node.required : []
    const missing = keys.filter((key) => !required.includes(key))
    if (missing.length) return `${at}: every property must be required; missing ${missing.join(', ')}`
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'enum' || key === 'const' || key === 'default' || key === 'examples') continue
    if (key === 'properties' && isObject(value)) {
      for (const [name, child] of Object.entries(value)) {
        const broken = checkNode(child, `${at}.properties.${name}`)
        if (broken) return broken
      }
      continue
    }
    const broken = checkNode(value, `${at}.${key}`)
    if (broken) return broken
  }
  return null
}

function isObjectSchema(node: Schema): boolean {
  const type = node.type
  return type === 'object' || (Array.isArray(type) && type.includes('object')) || isObject(node.properties)
}

export function substituteSkill(text: string, args: string, skillPath: string): string {
  const skillDir = dirname(skillPath)
  return text
    .split('${CLAUDE_SKILL_DIR}').join(skillDir)
    .split('${CLAUDE_PLUGIN_ROOT}').join(pluginRoot(skillDir))
    .split('$ARGUMENTS').join(args)
}

// A plugin skill lives at <plugin>/skills/<name>/SKILL.md; outside that layout the skill's
// own folder is the nearest stand-in for a plugin root.
function pluginRoot(skillDir: string): string {
  const parent = dirname(skillDir)
  return parent.endsWith('/skills') ? dirname(parent) : skillDir
}

function dirname(path: string): string {
  const cut = withoutTrailingSlash(path).lastIndexOf('/')
  return cut <= 0 ? '/' : path.slice(0, cut)
}

export async function prepareRun(fs: Fs, runDir: string, input: RunInput): Promise<PreparedRun> {
  if (input.resultSchema !== undefined) {
    const error = resultSchemaError(input.resultSchema)
    if (error) return { error }
  }

  let task = input.task
  if (input.skill) {
    let skillText: string
    try {
      skillText = await fs.read(input.skill)
    } catch (error) {
      return { error: `cannot read skill ${input.skill}: ${(error as Error).message}` }
    }
    const copy = `${runDir}/skill/SKILL.md`
    await fs.write(copy, substituteSkill(skillText, input.task, input.skill))
    task = `Read and follow ${copy}\n\nArguments: ${input.task}`
  }

  const promptPath = `${runDir}/prompt.md`
  const schemaPath = `${runDir}/schema.json`
  await fs.write(promptPath, `${PREAMBLE}\n\n${task}\n`)
  await fs.write(schemaPath, `${JSON.stringify(envelopeSchema(input.resultSchema), null, 2)}\n`)
  return { promptPath, schemaPath }
}
