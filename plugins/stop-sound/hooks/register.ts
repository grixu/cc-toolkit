const DONE_ASSET = 'sounds/done.wav'
const QUESTION_ASSET = 'sounds/question.wav'
const QUESTION_TOOLS = ['AskUserQuestion', 'ExitPlanMode']

const IN_FLIGHT = ['running', 'pending', 'waiting']

const MIME_BY_EXTENSION: Record<string, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  aiff: 'audio/aiff',
  aif: 'audio/aiff',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
}

type Turn = { agentId?: string; isAborted: boolean }
type Agent = { status: string }

// A main-loop turn that ends while a subagent or teammate still runs is a pause:
// the session wakes again when that agent reports back.
export function isWaitingForYou(turn: Turn, agents: readonly Agent[]): boolean {
  if (turn.agentId || turn.isAborted) return false
  return !agents.some((agent) => IN_FLIGHT.includes(agent.status))
}

export function mimeFor(path: string): string | undefined {
  return MIME_BY_EXTENSION[path.split('.').pop()?.toLowerCase() ?? '']
}

export function register(on, options) {
  // classic.Stop would carry background_tasks, but the built-in sec-default guard skips
  // user mods' classic.* hooks on Team and Enterprise plans, so turn.complete it is.
  // A failed chime hook drops out of the chain, so the turn or question goes on unchanged.
  on('turn.complete', async ($, e, next) => {
    if (isWaitingForYou(e, await $.agent.list())) chime($, options.stop_sound, DONE_ASSET)
    return next(e)
  }).catch(() => undefined)

  // Not awaited: next(e) runs the question itself, which waits for the person's answer.
  on('tool.call', { tool: QUESTION_TOOLS }, async ($, e, next) => {
    chime($, options.question_sound, QUESTION_ASSET)
    return next(e)
  }).catch(() => undefined)
}

async function chime($, customPath: string | undefined, asset: string) {
  try {
    await $.audio.play(await clipFor($, customPath, asset))
  } catch {
    // A machine with no audio output, or a custom file that cannot play, stays silent.
  }
}

export async function clipFor($, customPath: string | undefined, asset: string) {
  const mime = customPath ? mimeFor(customPath) : undefined
  if (!mime) return { asset }
  try {
    const { base64 } = await $.fs.read(customPath, { as: 'bytes' })
    return { base64, mime }
  } catch {
    return { asset }
  }
}
