import { expect, test } from 'claude-code/testing'
import { clipFor, isWaitingForYou, mimeFor } from '../hooks/register.ts'

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

function recordPlays(on) {
  const played: unknown[] = []
  on('audio.play', ($, e) => {
    played.push(e.clip ?? e)
    return { value: undefined }
  })
  return played
}

function agents(on, list: { id: string; type: string; status: string; description: string }[]) {
  on('agent.list', () => ({ value: list }))
}

const mainTurn = { answer: 'Done.', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' }

test('waits for you only on a finished main-loop turn with no agent in flight', () => {
  const main = { isAborted: false }
  expect(isWaitingForYou(main, [])).toBe(true)
  expect(isWaitingForYou(main, [{ status: 'completed' }, { status: 'idle' }])).toBe(true)
  expect(isWaitingForYou(main, [{ status: 'running' }])).toBe(false)
  expect(isWaitingForYou(main, [{ status: 'pending' }])).toBe(false)
  expect(isWaitingForYou(main, [{ status: 'waiting' }])).toBe(false)
  expect(isWaitingForYou({ agentId: 'a1', isAborted: false }, [])).toBe(false)
  expect(isWaitingForYou({ isAborted: true }, [])).toBe(false)
})

test('maps sound file extensions to their MIME type', () => {
  expect(mimeFor('/a/b/Done.WAV')).toBe('audio/wav')
  expect(mimeFor('ding.mp3')).toBe('audio/mpeg')
  expect(mimeFor('ding.flac')).toBe(undefined)
  expect(mimeFor('no-extension')).toBe(undefined)
})

test('picks the custom clip, and the bundled one when the custom file cannot play', async () => {
  const bundled = { asset: 'sounds/done.wav' }
  const readable = { fs: { read: async () => ({ base64: 'UklGRg==' }) } }
  const missing = {
    fs: {
      read: async () => {
        throw new Error('ENOENT')
      },
    },
  }

  expect(await clipFor(readable, '/s/ding.mp3', bundled.asset)).toEqual({ base64: 'UklGRg==', mime: 'audio/mpeg' })
  expect(await clipFor(readable, undefined, bundled.asset)).toEqual(bundled)
  expect(await clipFor(readable, '/s/ding.flac', bundled.asset)).toEqual(bundled)
  expect(await clipFor(missing, '/s/ding.mp3', bundled.asset)).toEqual(bundled)
})

test('chimes when the main turn ends with every subagent done', async ($, on) => {
  const played = recordPlays(on)
  agents(on, [{ id: 'a1', type: 'Explore', status: 'completed', description: 'search' }])
  on('turn.complete', () => ({ text: '' }))

  await $.turn.complete(mainTurn)
  await settle()

  expect(played).toEqual([expect.objectContaining({ asset: 'sounds/done.wav' })])
})

test('stays silent while a subagent still runs', async ($, on) => {
  const played = recordPlays(on)
  agents(on, [{ id: 'a1', type: 'general-purpose', status: 'running', description: 'review' }])
  on('turn.complete', () => ({ text: '' }))

  await $.turn.complete(mainTurn)
  await settle()

  expect(played).toEqual([])
})

test('stays silent when a subagent finishes its own turn', async ($, on) => {
  const played = recordPlays(on)
  agents(on, [])
  on('turn.complete', () => ({ text: '' }))

  await $.turn.complete({ ...mainTurn, agentId: 'a1' })
  await settle()

  expect(played).toEqual([])
})

test('chimes with the question sound and still runs the question', async ($, on) => {
  const played = recordPlays(on)
  on('tool.call', () => ({ result: 'answered' }))

  const result = await $.tool.call({ tool: 'AskUserQuestion', questions: [] })
  await settle()

  expect(result).toEqual(expect.objectContaining({ result: 'answered' }))
  expect(played).toEqual([expect.objectContaining({ asset: 'sounds/question.wav' })])
})

test('chimes with the question sound when a plan is presented', async ($, on) => {
  const played = recordPlays(on)
  on('tool.call', () => ({ result: 'approved' }))

  await $.tool.call({ tool: 'ExitPlanMode' })
  await settle()

  expect(played).toEqual([expect.objectContaining({ asset: 'sounds/question.wav' })])
})

test('stays silent on any other tool call', async ($, on) => {
  const played = recordPlays(on)
  on('tool.call', () => ({ result: 'ok' }))

  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await settle()

  expect(played).toEqual([])
})

test('a turn completes when the sound cannot play', async ($, on) => {
  on('audio.play', () => {
    throw new Error('no audio device')
  })
  agents(on, [])
  let reachedCore = false
  on('turn.complete', () => {
    reachedCore = true
    return { text: '' }
  })

  await $.turn.complete(mainTurn)
  await settle()

  expect(reachedCore).toBe(true)
})
