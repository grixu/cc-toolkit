import { withoutTrailingSlash, type Palette } from './harness.ts'

export const TIERS = ['high', 'medium', 'low'] as const
export type Tier = (typeof TIERS)[number]

export const BACKENDS = ['auto', 'typesafe', 'gemini'] as const
export type Backend = (typeof BACKENDS)[number]

export type PaletteConfig = { tiers: Partial<Record<Tier, string>>; exclude: string[] }

export type Config = {
  order: string[]
  disabled: string[]
  // harness id -> palette provider -> its tiers and exclusions
  palettes: Record<string, Record<string, PaletteConfig>>
  backend: Backend
}

// What one file says, with absent fields left out, so the merge can tell "not set" from "set to empty".
type FilePalette = { tiers?: Partial<Record<Tier, string>>; exclude?: string[] }
export type FileConfig = {
  order?: string[]
  disabled?: string[]
  palettes: Record<string, Record<string, FilePalette>>
  backend?: Backend
}

export const PROJECT_FILE = '.claude/collegium.json'

const MODEL_ID = /^[^/\s]+\/\S+$/

class ConfigError extends Error {}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function object(value: unknown, field: string, allowed?: readonly string[]): Record<string, unknown> {
  if (!isObject(value)) throw new ConfigError(`${field} must be an object`)
  const extra = allowed && Object.keys(value).find((key) => !allowed.includes(key))
  if (extra) throw new ConfigError(`${field}.${extra} is not a known field`)
  return value
}

function stringList(value: unknown, field: string, pattern?: RegExp): string[] {
  if (!Array.isArray(value)) throw new ConfigError(`${field} must be an array of strings`)
  value.forEach((item, i) => {
    if (typeof item !== 'string' || (pattern && !pattern.test(item))) {
      throw new ConfigError(`${field}[${i}] must be ${pattern ? 'a provider/model id' : 'a string'}`)
    }
  })
  return value
}

function parsePalette(value: unknown, field: string): FilePalette {
  const palette = object(value, field, ['tiers', 'exclude'])
  const out: FilePalette = {}
  if (palette.tiers !== undefined) {
    const tiers = object(palette.tiers, `${field}.tiers`, TIERS)
    for (const [tier, model] of Object.entries(tiers)) {
      if (typeof model !== 'string' || !MODEL_ID.test(model)) {
        throw new ConfigError(`${field}.tiers.${tier} must be a provider/model id`)
      }
    }
    out.tiers = tiers as Partial<Record<Tier, string>>
  }
  if (palette.exclude !== undefined) out.exclude = stringList(palette.exclude, `${field}.exclude`, MODEL_ID)
  return out
}

function parseFields(value: unknown): FileConfig {
  const root = object(value, '$', ['harnesses', 'decision'])
  const out: FileConfig = { palettes: {} }
  if (root.harnesses !== undefined) {
    const harnesses = object(root.harnesses, 'harnesses')
    for (const [key, entry] of Object.entries(harnesses)) {
      const field = `harnesses.${key}`
      if (key === 'order' || key === 'disabled') {
        out[key] = stringList(entry, field)
        continue
      }
      const harness = object(entry, field, ['palettes'])
      out.palettes[key] = {}
      if (harness.palettes === undefined) continue
      for (const [provider, palette] of Object.entries(object(harness.palettes, `${field}.palettes`))) {
        out.palettes[key][provider] = parsePalette(palette, `${field}.palettes.${provider}`)
      }
    }
  }
  if (root.decision !== undefined) {
    const decision = object(root.decision, 'decision', ['backend'])
    if (decision.backend !== undefined) {
      if (!BACKENDS.includes(decision.backend as Backend)) {
        throw new ConfigError(`decision.backend must be one of ${BACKENDS.join(', ')}`)
      }
      out.backend = decision.backend as Backend
    }
  }
  return out
}

export function parseConfig(text: string, file: string): FileConfig {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw new Error(`invalid config ${file}: not valid JSON (${(error as Error).message})`)
  }
  try {
    return parseFields(value)
  } catch (error) {
    if (error instanceof ConfigError) throw new Error(`invalid config ${file}: ${error.message}`)
    throw error
  }
}

// The project overrides the user field by field and can switch a harness off, never on.
export function mergeConfig(user: FileConfig, project: FileConfig): Config {
  const palettes: Config['palettes'] = {}
  for (const harness of new Set([...Object.keys(user.palettes), ...Object.keys(project.palettes)])) {
    const mine = user.palettes[harness] ?? {}
    const theirs = project.palettes[harness] ?? {}
    palettes[harness] = {}
    for (const provider of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
      const u = mine[provider] ?? {}
      const p = theirs[provider] ?? {}
      palettes[harness][provider] = {
        tiers: { ...u.tiers, ...p.tiers },
        exclude: [...(p.exclude ?? u.exclude ?? [])],
      }
    }
  }
  return {
    order: [...(project.order ?? user.order ?? [])],
    disabled: [...new Set([...(user.disabled ?? []), ...(project.disabled ?? [])])],
    palettes,
    backend: project.backend ?? user.backend ?? 'auto',
  }
}

async function readFile($, file: string): Promise<FileConfig> {
  let text: string
  try {
    if (!(await $.fs.exists(file))) return { palettes: {} }
    text = await $.fs.read(file)
  } catch (error) {
    throw new Error(`cannot read config ${file}: ${(error as Error).message}`)
  }
  return parseConfig(text, file)
}

export function configPaths(env: Record<string, string>): { user: string; project: string } {
  const data = env.CLAUDE_PLUGIN_DATA
  const project = env.CLAUDE_PROJECT_DIR
  if (!data) throw new Error('cannot locate the user config: CLAUDE_PLUGIN_DATA is not set')
  if (!project) throw new Error('cannot locate the project config: CLAUDE_PROJECT_DIR is not set')
  return { user: `${withoutTrailingSlash(data)}/config.json`, project: `${withoutTrailingSlash(project)}/${PROJECT_FILE}` }
}

// The data folder's name differs between a marketplace install and --plugin-dir, so the path comes only from the host.
export async function loadConfig($): Promise<Config> {
  const paths = configPaths(await $.process.hookEnv())
  return mergeConfig(await readFile($, paths.user), await readFile($, paths.project))
}

// Enabling a harness is the user's consent to send code to its vendor, so only `userConfig` can turn one on.
export function isEnabled(config: Config, harness: string, options: Record<string, unknown> | undefined): boolean {
  return options?.[harness] === true && !config.disabled.includes(harness)
}

export function paletteConfig(config: Config, harness: string, provider: string): PaletteConfig {
  return config.palettes[harness]?.[provider] ?? { tiers: {}, exclude: [] }
}

// A model mapped to a tier is kept even when excluded or hidden.
export function effectivePalette(palette: Palette, config: PaletteConfig): Palette {
  const mapped = new Set(Object.values(config.tiers))
  return {
    provider: palette.provider,
    models: palette.models.filter((m) => mapped.has(m.id) || (!m.hidden && !config.exclude.includes(m.id))),
  }
}
