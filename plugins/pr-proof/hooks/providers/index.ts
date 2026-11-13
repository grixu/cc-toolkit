import type { DecisionProvider, ProviderName } from '../decision.ts'
import { gemini } from './gemini.ts'
import { typesafe } from './typesafe.ts'

type Entry = { label: string; option: string; env: string[]; create: (key: string, options) => DecisionProvider }

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

// A new provider is one adapter file, one entry here, its line in providerKeys and its key option in userConfig.
const PROVIDERS: Record<ProviderName, Entry> = {
  typesafe: {
    label: 'TypeSafe',
    option: 'typesafe_api_key',
    env: ['TYPESAFE_API_KEY'],
    create: (key, options) => typesafe(key, { endpoint: options?.typesafe_endpoint, model: options?.typesafe_model }),
  },
  gemini: {
    label: 'Gemini',
    option: 'gemini_api_key',
    env: ['GEMINI_DECISIONS_API_KEY', 'GEMINI_API_KEY'],
    create: (key) => gemini(key),
  },
}

export type Keys = Record<ProviderName, string>

export const PROVIDER_NAMES = Object.keys(PROVIDERS) as ProviderName[]
export const MODES = ['auto', ...PROVIDER_NAMES, 'both'] as const
export const CHOICE_NEEDED = 'Backend choice needed:'

// The mods runtime accepts only a literal name in $.env.get and no $ passed through a dynamic call, so the keys are
// read here rather than by each entry.
export async function providerKeys($, options): Promise<Keys> {
  return {
    typesafe: text(options?.typesafe_api_key) || text(await $.env.get('TYPESAFE_API_KEY')),
    gemini:
      text(options?.gemini_api_key) || text(await $.env.get('GEMINI_DECISIONS_API_KEY')) || text(await $.env.get('GEMINI_API_KEY')),
  }
}

export function hasAnyKey(keys: Keys): boolean {
  return PROVIDER_NAMES.some((name) => keys[name])
}

export function missingKey(name: ProviderName, plugin: string): string {
  const { label, option, env } = PROVIDERS[name]
  return `no ${label} API key; set ${env.join(', ')} or the ${plugin} option ${option}`
}

export function label(name: ProviderName): string {
  return PROVIDERS[name].label
}

export function createProvider(name: ProviderName, keys: Keys, options): DecisionProvider {
  return PROVIDERS[name].create(keys[name], options)
}

// `requested` is the user's answer relayed by the skill, so it wins over the configured mode. With mode auto and more
// than one key set the user has not chosen yet, which the caller turns into a CHOICE_NEEDED result.
export function chooseBackends(options, requested: unknown, keys: Keys, plugin: string): ProviderName[] | 'choose' {
  if (requested !== undefined && !(MODES as readonly unknown[]).includes(requested))
    throw new Error(`\`backend\` must be ${MODES.slice(0, -1).join(', ')} or both`)
  const configured = text(options?.decision_backend)
  const mode = (requested ?? ((MODES as readonly string[]).includes(configured) ? configured : 'auto')) as (typeof MODES)[number]
  if (mode === 'auto') {
    const available = PROVIDER_NAMES.filter((name) => keys[name])
    if (available.length > 1) return 'choose'
    if (!available.length) throw new Error(missingKey('typesafe', plugin))
    return available
  }
  const names: ProviderName[] = mode === 'both' ? [...PROVIDER_NAMES] : [mode]
  const missing = names.find((name) => !keys[name])
  if (missing) throw new Error(missingKey(missing, plugin))
  const primary = primaryBackend(options)
  return names.includes(primary) ? [primary, ...names.filter((n) => n !== primary)] : names
}

export function primaryBackend(options): ProviderName {
  const configured = text(options?.primary_backend)
  return (PROVIDER_NAMES as string[]).includes(configured) ? (configured as ProviderName) : 'typesafe'
}

export function choiceNeeded(tool: string): string {
  return `${CHOICE_NEEDED} both a TypeSafe and a Gemini key are set and decision_backend is auto. Ask the user whether to use typesafe, gemini or both, then call ${tool} again with \`backend\` set to the answer.`
}

// Appends one JSON line through sh with the path and line as arguments, so neither is parsed as shell code.
export async function appendLine($, path: string, line: string): Promise<void> {
  await $.process.run(['sh', '-c', 'mkdir -p "$(dirname "$1")" && printf "%s\\n" "$2" >> "$1"', 'sh', path, line], { timeoutMs: 10_000 })
}
