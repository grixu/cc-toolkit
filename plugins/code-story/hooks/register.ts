import { readConfig, STACK, UNCOMMITTED } from './config.ts'

const TOOL = 'config'
const DESCRIPTION =
  `Return the code-story plugin's settings as JSON: the story languages (English plus an optional second one), whether a second-language term gets a gloss on first use, the diagram skill to use (null means the built-in diagrams), what to do with uncommitted changes (${UNCOMMITTED.join(', ')}) and with a stack of pull requests (${STACK.join(', ')}). Call it once at the start of a code story.`

export function register(on, options) {
  on('session.start', async ($, e, next) => {
    try {
      await $.tool.register({
        name: TOOL,
        description: DESCRIPTION,
        inputSchema: { type: 'object', properties: {} },
      })
    } catch {
      // Without the tool the skill falls back to the default settings and says so.
    }
    return next(e)
  })

  on('tool.call', { tool: `mcp__code-story__${TOOL}` }, () => ({
    result: JSON.stringify(readConfig(options), null, 2),
  })).catch(($, e, next) => ({
    result: `Settings unavailable (${next.error.kind}): ${next.error.message}. Use the defaults.`,
  }))
}
