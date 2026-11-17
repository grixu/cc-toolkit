import { expect, test } from 'claude-code/testing'
import type { DecisionRequest } from '../hooks/decision.ts'
import { GEMINI_URL, gemini } from '../hooks/providers/gemini.ts'
import { typesafe } from '../hooks/providers/typesafe.ts'

const REQUEST: DecisionRequest = {
  input: { slice: 'S', diff: '+a' },
  questions: {
    plain: { type: 'binary', instructions: 'Is it?' },
    judged: { type: 'binary', instructions: 'Is it?', criteria: { yes: 'Yes when.', no: 'No when.' } },
    rated: { type: 'scale', instructions: 'How much?', levels: ['None.', { description: 'Some.', notFor: 'A lot.' }, 'All.'] },
    picked: { type: 'choice', instructions: 'Which?', options: { left: 'The left one.', right: 'The right one.' } },
  },
}

test('the TypeSafe adapter writes the request in the bytes Jev was measured on', () => {
  const { url, init } = typesafe('k', { model: 'jev-x' }).encode(REQUEST)
  expect(url).toBe('https://api.typesafe.ai/v1/systemone')
  expect(init.headers).toEqual({ authorization: 'Bearer k', 'content-type': 'application/json' })
  expect(init.body).toBe(
    '{"model":"jev-x","state":{"slice":"S","diff":"+a"},"questions":{' +
      '"plain":{"type":"noul","instructions":"Is it?"},' +
      '"judged":{"type":"noul","instructions":"Is it?","criteria":{"true":"Yes when.","false":"No when."}},' +
      '"rated":{"type":"score","instructions":"How much?","criteria":["None.",{"what":"Some.","not_for":"A lot."},"All."]},' +
      '"picked":{"type":"choice","instructions":"Which?","criteria":{"left":"The left one.","right":"The right one."}}}}',
  )
  expect(typesafe('k', { endpoint: 'https://jev.example/v1/systemone/' }).encode(REQUEST).url).toBe('https://jev.example/v1/systemone')
})

test('the Gemini adapter sends the input as text and every level as plain text', () => {
  const { url, init } = gemini('g').encode(REQUEST)
  const body = JSON.parse(init.body)
  expect(url).toBe(GEMINI_URL)
  expect(init.headers).toEqual({ 'x-goog-api-key': 'g', 'content-type': 'application/json' })
  expect(body.model).toBe('gemini-decision-1')
  expect(JSON.parse(body.input)).toEqual(REQUEST.input)
  expect(body.questions.plain).toEqual({ type: 'noul', instructions: 'Is it?' })
  expect(body.questions.judged.criteria).toEqual({ true_description: 'Yes when.', false_description: 'No when.' })
  expect(body.questions.rated.criteria).toEqual(['None.', 'Some. This level is not for: A lot.', 'All.'])
  expect(body.questions.picked).toEqual({ type: 'choice', instructions: 'Which?', criteria: { left: 'The left one.', right: 'The right one.' } })
})

test('both adapters read every answer type into the internal shape and leave out answers without a value', () => {
  const wire = {
    answers: {
      plain: { noul: 0.8, confidence: 0.6 },
      judged: { noul: 'yes' },
      rated: { score: 1.2, probabilities: { '0': 0.1, '1': 0.6, '2': 0.3 }, confidence: 0.5, legend: ['None.', 'Some.', 'All.'] },
      picked: { choice: 'right', probabilities: { left: 0.2, right: 0.8 }, confidence: 0.7 },
      extra: { noul: 0.5 },
    },
  }
  const typesafeRead = typesafe('k').decode(REQUEST, { text: JSON.stringify({ model: 'jev-x', ...wire }) })
  const geminiRead = gemini('g').decode(REQUEST, { text: JSON.stringify(wire) })
  for (const read of [typesafeRead, geminiRead])
    expect(read.answers).toEqual({
      plain: { type: 'binary', p: 0.8, confidence: 0.6 },
      rated: { type: 'scale', expected: 1.2, probabilities: [0.1, 0.6, 0.3], confidence: 0.5 },
      picked: { type: 'choice', choice: 'right', probabilities: { left: 0.2, right: 0.8 }, confidence: 0.7 },
    })
  expect([typesafeRead.provider, typesafeRead.model]).toEqual(['typesafe', 'jev-x'])
  expect([geminiRead.provider, geminiRead.model]).toEqual(['gemini', 'gemini-decision-1'])
})

test('a scale answer with a distribution and no score takes its expected level from the distribution', () => {
  const read = typesafe('k').decodeAnswers(REQUEST, { rated: { probabilities: { '1': 0.5, '2': 0.5 } } })
  expect(read.rated).toEqual({ type: 'scale', expected: 1.5, probabilities: [0, 0.5, 0.5] })
})

test('a scale answer with no score and no probability on any level is left out', () => {
  expect(typesafe('k').decodeAnswers(REQUEST, { rated: { probabilities: {} } }).rated).toBeUndefined()
  expect(gemini('g').decodeAnswers(REQUEST, { rated: { probabilities: { x: 1 } } }).rated).toBeUndefined()
})

test('each adapter tells a too-long request, a block, a limit and an outage apart', () => {
  const ts = typesafe('k')
  const gm = gemini('g')
  const kind = (p, status: number, text = '') => p.failure({ status, text }).kind
  const geminiTooLong = '{"error":{"message":"The input token count exceeds the maximum number of tokens allowed 262144.","code":"invalid_request"}}'
  expect(kind(ts, 400, '{"error":{"code":"max_tokens_exceeded"}}')).toBe('too_long')
  expect(kind(gm, 400, geminiTooLong)).toBe('too_long')
  expect(kind(ts, 400, geminiTooLong)).toBe('other')
  expect(kind(gm, 400, '{"code": "safety"}')).toBe('blocked')
  expect(kind(ts, 403)).toBe('auth')
  expect(kind(gm, 401)).toBe('auth')
  expect(kind(ts, 429)).toBe('rate_limit')
  expect(kind(gm, 503)).toBe('retryable')
  expect(kind(ts, 529)).toBe('retryable')
  expect(kind(ts, 422)).toBe('other')
  expect(gm.failure({ status: 403, text: '' }).message).toMatch(/^Gemini rejected the API key \(HTTP 403\)/)
  expect(ts.failure({ status: 400, text: 'max_tokens_exceeded' }).message).toBe('A request was longer than the Jev model accepts (HTTP 400 max_tokens_exceeded).')
})
