import { expect, test } from 'claude-code/testing'
import { readConfig } from '../hooks/config.ts'

const TOOL = 'mcp__code-story__config'

test('registers the config tool at session start', async ($, on) => {
  const registered: string[] = []
  on('tool.register', ($, e) => {
    registered.push(e.name)
    return { value: { tool: TOOL } }
  })
  on('session.start', () => ({ cwd: '/work' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(registered).toEqual(['config'])
})

test('the tool answers with the default settings', async ($, on) => {
  on('tool.register', () => ({ value: { tool: TOOL } }))
  on('session.start', () => ({ cwd: '/work' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const answer = await $.tool.call({ tool: TOOL })
  expect(JSON.parse(answer.result)).toEqual({
    languages: ['en'],
    secondLanguage: null,
    glossFirstUse: true,
    diagramSkill: null,
    uncommitted: 'ignore',
    stack: 'ask',
    warnings: [],
  })
})

test('missing options give the defaults', () => {
  const config = readConfig(undefined)
  expect(config.languages).toEqual(['en'])
  expect(config.diagramSkill).toBe(null)
  expect(config.uncommitted).toBe('ignore')
  expect(config.stack).toBe('ask')
  expect(readConfig({}).languages).toEqual(['en'])
})

test('a second language is normalised and English is never doubled', () => {
  expect(readConfig({ second_language: ' PL ' }).languages).toEqual(['en', 'pl'])
  expect(readConfig({ second_language: 'pt-BR' }).secondLanguage).toBe('pt-br')
  expect(readConfig({ second_language: 'en' }).languages).toEqual(['en'])
})

test('an invalid language tag falls back to English only with a warning', () => {
  const config = readConfig({ second_language: 'polski!' })
  expect(config.languages).toEqual(['en'])
  expect(config.warnings.length).toBe(1)
})

test('a language tag has two or three letters before any subtag', () => {
  const tooLong = readConfig({ second_language: 'polski' })
  expect(tooLong.languages).toEqual(['en'])
  expect(tooLong.warnings.length).toBe(1)
  expect(readConfig({ second_language: 'fil' }).languages).toEqual(['en', 'fil'])
})

test('diagram_skill: empty or null means built-in, a slash is dropped', () => {
  expect(readConfig({ diagram_skill: '' }).diagramSkill).toBe(null)
  expect(readConfig({ diagram_skill: 'null' }).diagramSkill).toBe(null)
  expect(readConfig({ diagram_skill: '/fireworks-tech-graph' }).diagramSkill).toBe('fireworks-tech-graph')
  expect(readConfig({ diagram_skill: 'diagrams:draw' }).diagramSkill).toBe('diagrams:draw')
  expect(readConfig({ diagram_skill: 'rm -rf /' }).diagramSkill).toBe(null)
})

test('an unknown choice falls back to the default with a warning', () => {
  const config = readConfig({ uncommitted: 'sometimes', stack: 'ALWAYS' })
  expect(config.uncommitted).toBe('ignore')
  expect(config.stack).toBe('always')
  expect(config.warnings.length).toBe(1)
})

test('gloss_first_use accepts a boolean or its string form', () => {
  expect(readConfig({ gloss_first_use: false }).glossFirstUse).toBe(false)
  expect(readConfig({ gloss_first_use: 'false' }).glossFirstUse).toBe(false)
  expect(readConfig({}).glossFirstUse).toBe(true)
})
