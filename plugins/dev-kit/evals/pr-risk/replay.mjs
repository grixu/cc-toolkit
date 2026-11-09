import { createHash } from 'node:crypto'

export const hash = (text, algorithm = 'sha256') => createHash(algorithm).update(text).digest('hex')

export function requestProvenance(body) {
  const request = JSON.parse(body)
  return {
    requestHash: hash(body),
    key: hash(body, 'sha1'),
    requestedModel: request.model,
    questionsHash: hash(JSON.stringify(request.questions)),
    stateHash: hash(JSON.stringify(request.state)),
  }
}

// A supplied hash must match even when legacy replay was explicitly enabled.
export function consumeRecorded(pool, body, kind, slice, allowLegacy = false) {
  const requestHash = hash(body)
  const key = hash(body, 'sha1')
  const index = pool.findIndex((t) => {
    if (t.requestHash) return t.requestHash === requestHash
    if (t.key) return t.key === key
    return allowLegacy && t.kind === kind && t.slice === slice && t.bodyChars === body.length
  })
  if (index < 0) throw new Error(`replay: no exact recorded ${kind} request for slice ${JSON.stringify(slice ?? null)} (${requestHash})`)
  return pool.splice(index, 1)[0]
}

export function replayPayload(recorded) {
  const model = recorded.responseModel ?? recorded.model
  return { answers: recorded.answers, ...(recorded.usage && { usage: recorded.usage }), ...(model != null && { model }) }
}

export function slicingProvenance(request) {
  return { requestHash: hash(JSON.stringify(request)), model: request.model,
    systemHash: hash(request.system ?? ''), promptHash: hash(request.prompt ?? '') }
}

export function cachedSlicing(recorded, request, allowLegacy = false) {
  if (recorded.requestHash) {
    if (recorded.requestHash !== slicingProvenance(request).requestHash) throw new Error('slicing cache: request hash mismatch')
    return recorded.response
  }
  if (!allowLegacy) throw new Error('slicing cache: missing request hash; explicitly allow legacy frozen slices with --allow-legacy-slicing-cache')
  return recorded
}
