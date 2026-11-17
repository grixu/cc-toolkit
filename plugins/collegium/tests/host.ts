// The test's own `$` acts as Claude Code and has no process, env, fs or http, while a hooks function needs the
// mods API `$` that a hook receives. An inline test mod hands its `$` over, and the test's stubs answer its calls.
const PROBE = 'collegium_test_probe'

let body: (($: any) => Promise<unknown>) | undefined

export const host = {
  name: 'collegium-test-host',
  register(on) {
    on('tool.call', { tool: PROBE }, async ($) => {
      try {
        return { result: JSON.stringify({ value: await body!($) }) }
      } catch (error) {
        return { result: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }
      }
    })
  },
}

/** Calls `fn` with the host mod's `$` and `args`, through a tool call on the test's `$`. Needs `{ plugins: [host] }` on the test. */
export async function inHost<A extends unknown[], T>($, fn: ($: any, ...args: A) => Promise<T>, ...args: A): Promise<T> {
  body = (api) => fn(api, ...args)
  const out = JSON.parse((await $.tool.call({ tool: PROBE })).result)
  if ('error' in out) throw new Error(out.error)
  return out.value
}
