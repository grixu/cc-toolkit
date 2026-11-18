// The kit's own `$` acts as Claude Code and has no process, env, fs or http, and an inline test mod cannot import a
// hooks function, so a hooks function gets this `$`, whose calls the test's stubs answer in the kit's stub shape.
type Stub = ($: any, e: any) => { value?: unknown; deny?: string } | Promise<{ value?: unknown; deny?: string }>

export type FakeTimer = { ms: number; fn: () => void; cancelled: boolean }

export function stubbedHost() {
  const stubs: Record<string, Stub> = {}
  const timers: FakeTimer[] = []
  const call = async (name: string, e: Record<string, unknown>) => {
    const stub = stubs[name]
    if (!stub) throw new Error(`no implementation for ${name}`)
    const out = await stub($, e)
    if (out.deny !== undefined) throw new Error(out.deny)
    return out.value
  }
  const $ = {
    process: {
      run: (argv: string[], init?: Record<string, unknown>) => call('process.run', { argv, init }),
      // The stub answers an async generator of `{ stream, text }` pieces that returns `{ code, signal }`.
      spawn: (request: Record<string, unknown>) =>
        (async function* () {
          const child = (await call('process.spawn', request)) as AsyncGenerator<unknown, unknown>
          return yield* child
        })(),
    },
    env: { get: (name: string) => call('env.get', { name }) },
    fs: {
      read: (path: string, options?: Record<string, unknown>) => call('fs.read', { path, options }),
      write: (path: string, text: string) => call('fs.write', { path, text }),
      list: (path: string) => call('fs.list', { path }),
      exists: (path: string) => call('fs.exists', { path }),
      stat: (path: string) => call('fs.stat', { path }),
    },
    http: { fetch: (url: string, init?: Record<string, unknown>) => call('http.fetch', { url, init }) },
    clock: {
      now: () => call('clock.now', {}),
      after: (ms: number, fn: () => void) => {
        const timer: FakeTimer = { ms, fn, cancelled: false }
        timers.push(timer)
        return { cancel: () => (timer.cancelled = true) }
      },
    },
    session: { root: () => call('session.root', {}) },
    prompt: { submit: (input: Record<string, unknown>) => call('prompt.submit', input) },
  }
  const on = (name: string, stub: Stub) => {
    stubs[name] = stub
  }
  return { $, on, timers }
}

export function stubEnv(on: (name: string, stub: Stub) => void, vars: Record<string, string>) {
  on('env.get', (_, e) => ({ value: vars[e.name] }))
}
