import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cachedSlicing, consumeRecorded, hash, replayPayload, requestProvenance, slicingProvenance } from './replay.mjs'

const body = JSON.stringify({ model: 'jev-pinned', questions: { score: { instructions: 'read it' } }, state: { slice: 'a', diff: 'abc' } })

test('exact matching consumes duplicate recorded responses in order', () => {
  const pool = [1, 2].map((n) => ({ ...requestProvenance(body), answers: { score: n } }))
  assert.equal(consumeRecorded(pool, body, 'diff', 'a').answers.score, 1)
  assert.equal(consumeRecorded(pool, body, 'diff', 'a').answers.score, 2)
  assert.throws(() => consumeRecorded(pool, body, 'diff', 'a'), /no exact recorded/)
})

test('same-length prompt/state/model changes cannot use a hashed recording, even with legacy opt-in', () => {
  const entry = { ...requestProvenance(body), kind: 'diff', slice: 'a', bodyChars: body.length }
  for (const changed of [body.replace('read it', 'skip it'), body.replace('abc', 'xyz'), body.replace('jev-pinned', 'jev-latest')]) {
    assert.equal(changed.length, body.length)
    assert.throws(() => consumeRecorded([entry], changed, 'diff', 'a', true), /no exact recorded/)
  }
  assert.equal(consumeRecorded([{ key: hash(body, 'sha1') }], body, 'diff', 'a').key, hash(body, 'sha1'))
})

test('shape-only legacy recording requires explicit opt-in', () => {
  const entry = { kind: 'diff', slice: 'a', bodyChars: body.length }
  assert.throws(() => consumeRecorded([entry], body, 'diff', 'a'), /no exact recorded/)
  assert.deepEqual(consumeRecorded([entry], body, 'diff', 'a', true), entry)
  assert.throws(() => consumeRecorded([entry], body, 'diff', 'b', true), /no exact recorded/)
})

test('replay preserves response model and usage, without inventing missing metadata', () => {
  const answers = { score: 3 }
  assert.deepEqual(replayPayload({ answers, responseModel: 'jev-actual', requestedModel: 'jev-alias', usage: { input_tokens: 8 } }),
    { answers, model: 'jev-actual', usage: { input_tokens: 8 } })
  assert.deepEqual(replayPayload({ answers, model: 'old-recorded-model' }), { answers, model: 'old-recorded-model' })
  assert.deepEqual(replayPayload({ answers, requestedModel: 'jev-alias' }), { answers })
})

test('provenance changes with questions and state without storing their private text', () => {
  const original = requestProvenance(body)
  const changedQuestion = requestProvenance(body.replace('read it', 'skip it'))
  const changedState = requestProvenance(body.replace('abc', 'xyz'))
  assert.notEqual(original.questionsHash, changedQuestion.questionsHash)
  assert.equal(original.stateHash, changedQuestion.stateHash)
  assert.notEqual(original.stateHash, changedState.stateHash)
  assert.equal(original.questionsHash, changedState.questionsHash)
  assert.equal('state' in original, false)
  assert.equal('questions' in original, false)
})

test('slicing cache matches the entire request including model, system and prompt', () => {
  const request = { model: 'haiku', system: 'group files', prompt: 'a.ts b.ts', timeoutMs: 100 }
  const response = { isAnswered: true, text: '[]' }
  const record = { ...slicingProvenance(request), response }
  assert.deepEqual(cachedSlicing(record, request), response)
  for (const field of ['model', 'system', 'prompt'])
    assert.throws(() => cachedSlicing(record, { ...request, [field]: `${request[field]}!` }, true), /hash mismatch/)
  assert.throws(() => cachedSlicing(response, request), /allow-legacy-slicing-cache/)
  assert.deepEqual(cachedSlicing(response, request, true), response)
})
