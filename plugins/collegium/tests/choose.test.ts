import { expect, test } from 'claude-code/testing'
import { choose, type ChoiceRequest } from '../hooks/choose.ts'
import { failure, stubEnv, stubbedHost } from './host.ts'

const PALETTE = {
  provider: 'openai',
  models: [
    { id: 'openai/sol', hidden: false, efforts: ['low', 'medium', 'high', 'ultra'], defaultEffort: 'high' },
    { id: 'openai/luna', hidden: false, efforts: ['low', 'medium'], defaultEffort: 'medium' },
    { id: 'openai/old', hidden: false, efforts: ['low'], defaultEffort: 'low' },
    { id: 'openai/reserve', hidden: true, efforts: ['low', 'high'], defaultEffort: 'high' },
  ],
}

function request(over: Partial<ChoiceRequest> = {}): ChoiceRequest {
  return { palette: PALETTE, config: { tiers: {}, exclude: [] }, backend: 'auto', task: 'Fix the bug.', ...over }
}

type Asked = { url: string; options: Record<string, string>; state: Record<string, unknown> }

function backendHost(keys: Record<string, string>, prefer: string[], fallback?: string) {
  const { $, on } = stubbedHost()
  stubEnv(on, keys)
  const asked: Asked[] = []
  on('http.fetch', (_, e) => {
    const body = JSON.parse(e.init.body)
    const options = body.questions.choice.criteria
    asked.push({ url: e.url, options, state: body.state })
    const choice = prefer.find((p) => p in options) ?? fallback ?? Object.keys(options)[0]
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ model: 'jev', answers: { choice: { choice, probabilities: {} } } }) } }
  })
  return { $, on, asked }
}

function haikuHost(reply: string) {
  const { $, on } = stubbedHost()
  stubEnv(on, {})
  const prompts: string[] = []
  on('model.complete', (_, e) => {
    prompts.push(String(e.prompt))
    expect(e.model).toBe('haiku')
    return { value: { isAnswered: true, text: reply } }
  })
  return { $, prompts }
}

test('a caller giving both a known model and its effort asks no one', async () => {
  const { $ } = stubbedHost()
  expect(await choose($, request({ model: 'openai/luna', effort: 'low' }))).toEqual({
    model: 'openai/luna',
    effort: 'low',
    chosenBy: 'caller',
    source: { model: 'caller', effort: 'caller' },
  })
})

test('an unknown model or an effort the model lacks is an error before anything is asked', async () => {
  const { $ } = stubbedHost()
  expect(await failure(() => choose($, request({ model: 'openai/nope', effort: 'low' })))).toContain('unknown model openai/nope')
  expect(await failure(() => choose($, request({ model: 'openai/luna', effort: 'ultra' })))).toBe('openai/luna has no effort ultra; it supports low, medium')
})

test('with a tier map the backend picks among the mapped tiers only, then the effort of that tier model', async () => {
  const { $, asked } = backendHost({ TYPESAFE_API_KEY: 'k' }, ['low'])
  const config = { tiers: { high: 'openai/sol', low: 'openai/luna' }, exclude: [] }
  expect(await choose($, request({ config }))).toEqual({
    model: 'openai/luna',
    effort: 'low',
    chosenBy: 'typesafe',
    source: { model: 'decision', effort: 'decision' },
  })
  expect(Object.keys(asked[0].options)).toEqual(['high', 'low'])
  expect(asked[0].state).toEqual({ task: 'Fix the bug.' })
  expect(Object.keys(asked[1].options)).toEqual(['low', 'medium'])
  expect(asked[1].state).toEqual({ task: 'Fix the bug.', model: 'openai/luna' })
})

test('without a tier map the backend picks from the palette, leaving out excluded and hidden models', async () => {
  const { $, asked } = backendHost({ TYPESAFE_API_KEY: 'k' }, ['openai/sol', 'ultra'])
  const config = { tiers: {}, exclude: ['openai/old'] }
  expect(await choose($, request({ config }))).toMatchObject({ model: 'openai/sol', effort: 'ultra' })
  expect(Object.keys(asked[0].options)).toEqual(['openai/sol', 'openai/luna'])
})

test('a hidden model mapped to a tier is offered', async () => {
  const { $, asked } = backendHost({ TYPESAFE_API_KEY: 'k' }, ['medium', 'high'])
  const config = { tiers: { medium: 'openai/reserve' }, exclude: [] }
  expect(await choose($, request({ config }))).toMatchObject({ model: 'openai/reserve', effort: 'high' })
  expect(Object.keys(asked[0].options)).toEqual(['medium'])
})

test('a caller giving the model but no effort gets only the effort chosen', async () => {
  const { $, asked } = backendHost({ TYPESAFE_API_KEY: 'k' }, ['low'])
  expect(await choose($, request({ model: 'openai/sol' }))).toEqual({
    model: 'openai/sol',
    effort: 'low',
    chosenBy: 'typesafe',
    source: { model: 'caller', effort: 'decision' },
  })
  expect(asked.length).toBe(1)
  expect(Object.keys(asked[0].options)).toEqual(['low', 'medium', 'high', 'ultra'])
})

test('a caller giving only the effort gets a model that supports it', async () => {
  const { $, asked } = backendHost({ TYPESAFE_API_KEY: 'k' }, ['openai/sol'])
  expect(await choose($, request({ effort: 'medium' }))).toEqual({
    model: 'openai/sol',
    effort: 'medium',
    chosenBy: 'typesafe',
    source: { model: 'decision', effort: 'caller' },
  })
  expect(asked.length).toBe(1)
  expect(Object.keys(asked[0].options)).toEqual(['openai/sol', 'openai/luna'])
})

test('auto with both keys takes TypeSafe instead of asking anyone', async () => {
  const { $, asked } = backendHost({ TYPESAFE_API_KEY: 'k', GEMINI_API_KEY: 'g' }, ['openai/luna', 'low'])
  expect(await choose($, request())).toMatchObject({ chosenBy: 'typesafe' })
  expect(asked.every((a) => a.url.includes('api.typesafe.ai'))).toBe(true)
})

test('a configured gemini backend is the one asked', async () => {
  const { $, asked } = backendHost({ TYPESAFE_API_KEY: 'k', GEMINI_API_KEY: 'g' }, ['openai/luna', 'low'])
  expect(await choose($, request({ backend: 'gemini' }))).toMatchObject({ chosenBy: 'gemini' })
  expect(asked.every((a) => a.url.includes('generativelanguage.googleapis.com'))).toBe(true)
})

test('with no key one Haiku call chooses both from the allowed set', async () => {
  const { $, prompts } = haikuHost('Sure: {"model": "openai/luna", "effort": "low"}')
  expect(await choose($, request())).toEqual({
    model: 'openai/luna',
    effort: 'low',
    chosenBy: 'haiku',
    source: { model: 'decision', effort: 'decision' },
  })
  expect(prompts.length).toBe(1)
  expect(prompts[0]).toContain('openai/sol')
  expect(prompts[0]).not.toContain('openai/reserve')
})

test('a Haiku answer outside the allowed set leaves both to the harness defaults', async () => {
  for (const reply of ['{"model": "openai/reserve", "effort": "low"}', '{"model": "openai/luna", "effort": "ultra"}', 'no idea']) {
    const { $ } = haikuHost(reply)
    expect(await choose($, request())).toEqual({ chosenBy: 'haiku', source: { model: 'default', effort: 'default' } })
  }
})

test('a Haiku answer outside the allowed set keeps what the caller gave', async () => {
  const { $ } = haikuHost('{"model": "openai/sol", "effort": "huge"}')
  expect(await choose($, request({ model: 'openai/sol' }))).toEqual({
    model: 'openai/sol',
    chosenBy: 'haiku',
    source: { model: 'caller', effort: 'default' },
  })
})

test('Haiku not answering leaves both to the harness defaults', async () => {
  const { $, on } = stubbedHost()
  stubEnv(on, {})
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'api-error' } }))
  expect(await choose($, request())).toEqual({ chosenBy: 'haiku', source: { model: 'default', effort: 'default' } })
})

test('a failing backend falls back to Haiku', async () => {
  const { $, on } = stubbedHost()
  stubEnv(on, { TYPESAFE_API_KEY: 'k' })
  on('http.fetch', () => ({ value: { status: 401, ok: false, headers: {}, text: '' } }))
  on('model.complete', () => ({ value: { isAnswered: true, text: '{"model": "openai/sol", "effort": "high"}' } }))
  expect(await choose($, request())).toMatchObject({ model: 'openai/sol', effort: 'high', chosenBy: 'haiku' })
})

test('a configured backend without its key falls back to Haiku', async () => {
  const { $, on } = stubbedHost()
  stubEnv(on, { TYPESAFE_API_KEY: 'k' })
  on('model.complete', () => ({ value: { isAnswered: true, text: '{"model": "openai/sol", "effort": "high"}' } }))
  expect(await choose($, request({ backend: 'gemini' }))).toMatchObject({ model: 'openai/sol', effort: 'high', chosenBy: 'haiku' })
})

test('a backend answer outside the options falls back to Haiku', async () => {
  const { $, on } = backendHost({ TYPESAFE_API_KEY: 'k' }, [], 'openai/nope')
  on('model.complete', () => ({ value: { isAnswered: true, text: '{"model": "openai/luna", "effort": "medium"}' } }))
  expect(await choose($, request())).toMatchObject({ model: 'openai/luna', effort: 'medium', chosenBy: 'haiku' })
})

test('an effort no palette model supports is an error', async () => {
  const { $ } = stubbedHost()
  const config = { tiers: { low: 'openai/luna' }, exclude: [] }
  expect(await failure(() => choose($, request({ config, effort: 'ultra' })))).toBe('no model in the openai palette supports effort ultra')
})
