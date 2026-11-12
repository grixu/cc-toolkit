export const UNCOMMITTED = ['ignore', 'include', 'ask'] as const
export const STACK = ['ask', 'always', 'never'] as const

export type Config = {
  languages: string[]
  secondLanguage: string | null
  glossFirstUse: boolean
  diagramSkill: string | null
  uncommitted: (typeof UNCOMMITTED)[number]
  stack: (typeof STACK)[number]
  warnings: string[]
}

const LANGUAGE_TAG = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/
const SKILL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*(:[A-Za-z0-9][A-Za-z0-9._-]*)?$/

export function readConfig(options: Record<string, unknown> | undefined): Config {
  const o = options ?? {}
  const warnings: string[] = []
  const secondLanguage = readLanguage(o.second_language, warnings)
  return {
    languages: secondLanguage ? ['en', secondLanguage] : ['en'],
    secondLanguage,
    glossFirstUse: o.gloss_first_use !== false && o.gloss_first_use !== 'false',
    diagramSkill: readSkill(o.diagram_skill, warnings),
    uncommitted: readChoice('uncommitted', o.uncommitted, UNCOMMITTED, warnings),
    stack: readChoice('stack', o.stack, STACK, warnings),
    warnings,
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readLanguage(value: unknown, warnings: string[]): string | null {
  const tag = text(value).toLowerCase()
  if (!tag || tag === 'en') return null
  if (!LANGUAGE_TAG.test(tag)) {
    warnings.push(`second_language "${tag}" is not a language tag such as pl or pt-br; the story is English only`)
    return null
  }
  return tag
}

function readSkill(value: unknown, warnings: string[]): string | null {
  const name = text(value).replace(/^\//, '')
  if (!name || name === 'null') return null
  if (!SKILL_NAME.test(name)) {
    warnings.push(`diagram_skill "${name}" is not a skill name; the built-in diagrams are used`)
    return null
  }
  return name
}

function readChoice<T extends string>(key: string, value: unknown, allowed: readonly T[], warnings: string[]): T {
  const choice = text(value).toLowerCase()
  if ((allowed as readonly string[]).includes(choice)) return choice as T
  if (choice) warnings.push(`${key} "${choice}" is not one of ${allowed.join(', ')}; using ${allowed[0]}`)
  return allowed[0]
}
