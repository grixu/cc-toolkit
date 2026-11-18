import { expect, test } from 'claude-code/testing'
import { effectivePalette, isEnabled, loadConfig, mergeConfig, parseConfig } from '../hooks/config.ts'
import { stubbedHost } from './host.ts'

const USER_FILE = '/data/collegium/config.json'
const PROJECT_FILE = '/repo/.claude/collegium.json'

function hostWith(files: Record<string, string>) {
  const { $, on } = stubbedHost()
  on('process.hookEnv', () => ({ value: { CLAUDE_PLUGIN_DATA: '/data/collegium/', CLAUDE_PROJECT_DIR: '/repo' } }))
  on('fs.exists', (_, e) => ({ value: e.path in files }))
  on('fs.read', (_, e) => (e.path in files ? { value: files[e.path] } : { deny: `ENOENT: ${e.path}` }))
  return $
}

async function failure(work: () => unknown): Promise<string> {
  try {
    await work()
  } catch (error) {
    return (error as Error).message
  }
  return 'no error'
}

const parse = (value: unknown) => parseConfig(JSON.stringify(value), 'f.json')

test('no files give the defaults: nothing disabled, no tiers, backend auto', async () => {
  expect(await loadConfig(hostWith({}))).toEqual({ order: [], disabled: [], palettes: {}, backend: 'auto' })
})

test('the user file comes from CLAUDE_PLUGIN_DATA and the project file from the project root', async () => {
  const $ = hostWith({
    [USER_FILE]: JSON.stringify({ decision: { backend: 'gemini' } }),
    [PROJECT_FILE]: JSON.stringify({ harnesses: { order: ['codex'] } }),
  })
  expect(await loadConfig($)).toMatchObject({ order: ['codex'], backend: 'gemini' })
})

test('tier keys merge one by one, the project winning per tier', () => {
  const user = parse({ harnesses: { codex: { palettes: { openai: { tiers: { high: 'openai/a', low: 'openai/c' } } } } } })
  const project = parse({ harnesses: { codex: { palettes: { openai: { tiers: { high: 'openai/b', medium: 'openai/m' } } } } } })
  expect(mergeConfig(user, project).palettes.codex.openai.tiers).toEqual({ high: 'openai/b', medium: 'openai/m', low: 'openai/c' })
})

test("a project exclude list replaces the user's, and an absent one keeps it", () => {
  const user = parse({ harnesses: { codex: { palettes: { openai: { exclude: ['openai/x', 'openai/y'] } } } } })
  const replacing = parse({ harnesses: { codex: { palettes: { openai: { exclude: [] } } } } })
  const silent = parse({ harnesses: { codex: { palettes: { openai: { tiers: { low: 'openai/l' } } } } } })
  expect(mergeConfig(user, replacing).palettes.codex.openai.exclude).toEqual([])
  expect(mergeConfig(user, silent).palettes.codex.openai.exclude).toEqual(['openai/x', 'openai/y'])
})

test("the project order replaces the user's and the project backend wins", () => {
  const user = parse({ harnesses: { order: ['codex', 'cursor'] }, decision: { backend: 'typesafe' } })
  const project = parse({ harnesses: { order: ['cursor'] }, decision: { backend: 'gemini' } })
  expect(mergeConfig(user, project)).toMatchObject({ order: ['cursor'], backend: 'gemini' })
  expect(mergeConfig(user, parse({}))).toMatchObject({ order: ['codex', 'cursor'], backend: 'typesafe' })
})

test('a project disabled entry switches Codex off even when userConfig turns it on', () => {
  const config = mergeConfig(parse({}), parse({ harnesses: { disabled: ['codex'] } }))
  expect(isEnabled(config, 'codex', { codex: true })).toBe(false)
})

test('the project file cannot enable a Codex the user disabled', () => {
  const user = parse({ harnesses: { disabled: ['codex'] } })
  const project = parse({ harnesses: { disabled: [], order: ['codex'] } })
  const config = mergeConfig(user, project)
  expect(config.disabled).toEqual(['codex'])
  expect(isEnabled(config, 'codex', { codex: true })).toBe(false)
})

test('a harness is enabled only by its userConfig flag', () => {
  const config = mergeConfig(parse({}), parse({}))
  expect(isEnabled(config, 'codex', { codex: true })).toBe(true)
  expect(isEnabled(config, 'codex', { codex: false })).toBe(false)
  expect(isEnabled(config, 'codex', {})).toBe(false)
  expect(isEnabled(config, 'codex', undefined)).toBe(false)
})

test('an invalid file names the file and the field', async () => {
  const $ = hostWith({ [PROJECT_FILE]: JSON.stringify({ harnesses: { codex: { palettes: { openai: { tiers: { high: 'gpt-6' } } } } } }) })
  const message = await failure(() => loadConfig($))
  expect(message).toContain(PROJECT_FILE)
  expect(message).toContain('harnesses.codex.palettes.openai.tiers.high')
})

test('invalid fields are refused, each one named', async () => {
  const cases: [unknown, string][] = [
    [[], '$ must be an object'],
    [{ harness: {} }, '$.harness'],
    [{ harnesses: { disabled: 'codex' } }, 'harnesses.disabled'],
    [{ harnesses: { order: [1] } }, 'harnesses.order[0]'],
    [{ harnesses: { codex: { palettes: { openai: { tiers: { top: 'openai/a' } } } } } }, 'harnesses.codex.palettes.openai.tiers.top'],
    [{ harnesses: { codex: { palettes: { openai: { exclude: ['nope'] } } } } }, 'harnesses.codex.palettes.openai.exclude[0]'],
    [{ decision: { backend: 'openai' } }, 'decision.backend'],
  ]
  for (const [value, field] of cases) expect(await failure(() => parse(value))).toContain(field)
})

test('a file that is not JSON or cannot be read is an error naming it', async () => {
  expect(await failure(() => loadConfig(hostWith({ [USER_FILE]: '{ "harnesses": ' })))).toContain(`invalid config ${USER_FILE}: not valid JSON`)

  const { $, on } = stubbedHost()
  on('process.hookEnv', () => ({ value: { CLAUDE_PLUGIN_DATA: '/data/collegium', CLAUDE_PROJECT_DIR: '/repo' } }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ deny: 'EACCES: permission denied' }))
  expect(await failure(() => loadConfig($))).toContain(`cannot read config ${USER_FILE}: EACCES`)
})

const model = (id: string, hidden = false) => ({ id, hidden, efforts: ['low', 'high'], defaultEffort: 'high' })
const PALETTE = {
  provider: 'openai',
  models: [model('openai/gpt-6.1-sol'), model('openai/gpt-5.6-luna'), model('openai/gpt-reserve', true), model('openai/codex-auto-review', true)],
}

test('the effective palette drops excluded and hidden models', () => {
  const ids = effectivePalette(PALETTE, { tiers: {}, exclude: ['openai/gpt-5.6-luna'] }).models.map((m) => m.id)
  expect(ids).toEqual(['openai/gpt-6.1-sol'])
})

test('a model mapped to a tier stays in the palette even when excluded or hidden', () => {
  const config = { tiers: { high: 'openai/gpt-5.6-luna', low: 'openai/gpt-reserve' }, exclude: ['openai/gpt-5.6-luna'] }
  const ids = effectivePalette(PALETTE, config).models.map((m) => m.id)
  expect(ids).toEqual(['openai/gpt-6.1-sol', 'openai/gpt-5.6-luna', 'openai/gpt-reserve'])
})
