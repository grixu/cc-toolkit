import { expect, test } from 'claude-code/testing'
import { codex } from '../hooks/codex.ts'
import { exit, failure, ok, stubbedHost } from './host.ts'

const SPEC = { runDir: '/r/run1', dir: '/repo', write: false, prompt: 'Do it.', schemaPath: '/r/run1/schema.json', env: {} }

test('a read-only run passes the full argv and leaves model and effort to Codex when not chosen', () => {
  const { argv, env, cwd } = codex.invocation(SPEC)
  expect(argv).toEqual([
    'codex', 'exec', '--skip-git-repo-check', '-C', '/repo', '-s', 'read-only',
    '--json', '-o', '/r/run1/last.json', '--output-schema', '/r/run1/schema.json', 'Do it.',
  ])
  expect(argv).not.toContain('--ephemeral')
  expect(env).toEqual({})
  expect(cwd).toBe('/r/run1')
})

test('a write run uses workspace-write, the bare model slug and the effort override', () => {
  const { argv, env } = codex.invocation({
    ...SPEC,
    dir: '/r/run1/worktree',
    write: true,
    model: 'openai/gpt-6-luna',
    effort: 'low',
    env: { CODEX_HOME: '/tmp/h' },
  })
  expect(argv.slice(3, 11)).toEqual(['-C', '/r/run1/worktree', '-s', 'workspace-write', '-m', 'gpt-6-luna', '-c', 'model_reasoning_effort=low'])
  expect(env).toEqual({ CODEX_HOME: '/tmp/h' })
})

test('events map to progress kinds, and error events are warnings, never failures', () => {
  const events = [
    '{"type":"thread.started","thread_id":"t"}',
    '{"type":"item.completed","item":{"id":"0","type":"error","message":"[features].multi_agent is deprecated"}}',
    '{"type":"error","message":"reconnecting"}',
    '{"type":"item.completed","item":{"id":"1","type":"command_execution","command":"ls","aggregated_output":"","status":"completed"}}',
    '{"type":"item.completed","item":{"id":"2","type":"agent_message","text":"OK"}}',
    '{"type":"turn.completed","usage":{}}',
    '{"type":"turn.failed","error":{"message":"quota exceeded"}}',
    'not json',
  ].map((line) => codex.parseEvent(line))
  expect(events.map((e) =>e && [e.kind, e.text])).toEqual([
    null,
    ['warning', '[features].multi_agent is deprecated'],
    ['warning', 'reconnecting'],
    ['command', 'ls'],
    ['message', 'OK'],
    null,
    ['failed', 'quota exceeded'],
    null,
  ])
})

test('the catalogue becomes one openai palette with hidden flags and per-model efforts', async () => {
  const { $, on } = stubbedHost()
  on('process.run', ($, e) =>
    e.argv[1] === 'debug'
      ? ok(JSON.stringify({ models: [
          { slug: 'gpt-6.1-sol', visibility: 'list', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }, { effort: 'ultra' }], default_reasoning_level: 'high' },
          { slug: 'gpt-reserve', visibility: 'hide', supported_reasoning_levels: [{ effort: 'medium' }], default_reasoning_level: 'medium' },
        ] }))
      : ok('codex-cli 0.165.0\n'),
  )
  expect(await codex.catalogue($)).toEqual([
    {
      provider: 'openai',
      models: [
        { id: 'openai/gpt-6.1-sol', hidden: false, efforts: ['low', 'high', 'ultra'], defaultEffort: 'high' },
        { id: 'openai/gpt-reserve', hidden: true, efforts: ['medium'], defaultEffort: 'medium' },
      ],
    },
  ])
})

test('an unreadable catalogue fails naming the Codex version', async () => {
  const { $, on } = stubbedHost()
  on('process.run', ($, e) => (e.argv[1] === 'debug' ? ok('{"data":[]}') : ok('codex-cli 0.165.0\n')))
  const message = await failure(() => codex.catalogue($))
  expect(message).toContain('codex 0.165.0')
})

test('detection reads the version and reports a missing binary as not installed', async () => {
  const { $, on } = stubbedHost()
  let installed = true
  on('process.run', () => (installed ? ok('codex-cli 0.165.0\n') : exit(127)))
  expect(await codex.detect($)).toEqual({ installed: true, version: '0.165.0' })
  installed = false
  expect(await codex.detect($)).toEqual({ installed: false })
})

test('a version output without a version is still installed', async () => {
  const { $, on } = stubbedHost()
  on('process.run', () => ok(''))
  expect(await codex.detect($)).toEqual({ installed: true })
})

test('a catalogue model without a slug or with a malformed effort fails naming the Codex version', async () => {
  const { $, on } = stubbedHost()
  const broken = [
    { visibility: 'list', supported_reasoning_levels: [{ effort: 'low' }], default_reasoning_level: 'low' },
    { slug: 'gpt-x', supported_reasoning_levels: [{ effort: 'low' }] },
    { slug: 'gpt-x', supported_reasoning_levels: [{}], default_reasoning_level: 'low' },
  ]
  let model: unknown
  on('process.run', ($, e) => (e.argv[1] === 'debug' ? ok(JSON.stringify({ models: [model] })) : ok('codex-cli 0.165.0\n')))
  for (model of broken) {
    const message = await failure(() => codex.catalogue($))
    expect(message).toContain('codex 0.165.0')
    expect(message).toContain('model without slug or efforts')
  }
})

test('login status follows the exit code and passes the run env', async () => {
  const { $, on } = stubbedHost()
  const envs: unknown[] = []
  let code = 0
  on('process.run', ($, e) => {
    envs.push(e.init?.env)
    return exit(code)
  })
  expect(await codex.loginStatus($, { CODEX_HOME: '/h' })).toEqual({ loggedIn: true, fix: '! codex login' })
  expect(envs[0]).toEqual({ CODEX_HOME: '/h' })
  code = 1
  expect((await codex.loginStatus($, {})).loggedIn).toBe(false)
})

test('prepare returns no env and calls nothing', async () => {
  const { $, on } = stubbedHost()
  let calls = 0
  on('process.run', () => { calls++; return ok() })
  on('http.fetch', () => { calls++; return { deny: 'unexpected' } })
  on('env.get', () => { calls++; return { value: undefined } })
  expect(await codex.prepare($, 'run1')).toEqual({})
  expect(calls).toBe(0)
})

test('the final message is the -o file, or null when Codex wrote none', async () => {
  const { $, on } = stubbedHost()
  const reads: string[] = []
  let written = '{"status":"done"}'
  on('fs.read', ($, e) => {
    reads.push(JSON.stringify(e))
    return { value: written }
  })
  expect(await codex.finalMessage($, '/r/run1')).toBe('{"status":"done"}')
  expect(reads[0]).toContain('/r/run1/last.json')
  written = ''
  expect(await codex.finalMessage($, '/r/run1')).toBe(null)
})
