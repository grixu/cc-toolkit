// The kit's own `$` acts as Claude Code and has no process, env, fs or http, and an inline test mod cannot import a
// hooks function, so a hooks function gets this `$`, whose calls the test's stubs answer in the kit's stub shape.
type Stub = ($: any, e: any) => { value?: unknown; deny?: string } | Promise<{ value?: unknown; deny?: string }>

export function stubbedHost() {
  const stubs: Record<string, Stub> = {}
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
      hookEnv: () => call('process.hookEnv', {}),
    },
    env: { get: (name: string) => call('env.get', { name }) },
    fs: {
      read: (path: string) => call('fs.read', { path }),
      exists: (path: string) => call('fs.exists', { path }),
    },
    http: { fetch: (url: string, init?: Record<string, unknown>) => call('http.fetch', { url, init }) },
  }
  const on = (name: string, stub: Stub) => {
    stubs[name] = stub
  }
  return { $, on }
}

export function stubEnv(on: (name: string, stub: Stub) => void, vars: Record<string, string>) {
  on('env.get', (_, e) => ({ value: vars[e.name] }))
}
