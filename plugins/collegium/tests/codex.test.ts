import { expect, test } from 'claude-code/testing'
import { TOKEN_EXCHANGE_URL, codex } from '../hooks/codex.ts'
import { stubEnv, stubbedHost } from './host.ts'

const ok = (stdout = '') => ({ value: { exitCode: 0, stdout, stderr: '' } })
const exit = (exitCode: number) => ({ value: { exitCode, stdout: '', stderr: '' } })
const fetched = (status: number, body: unknown = {}) => ({
  value: { status, ok: status >= 200 && status < 300, headers: {}, text: JSON.stringify(body) },
})

const SPEC = { runDir: '/r/run1', dir: '/repo', write: false, prompt: 'Do it.', env: {} }

const CI_ENV = {
  EVAL_ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'request-token-secret',
  EVAL_ACTIONS_ID_TOKEN_REQUEST_URL: 'https://gh.example/token?api-version=2.0',
  EVAL_OPENAI_WIF_AUDIENCE: 'openai wif',
  EVAL_OPENAI_IDENTITY_PROVIDER_ID: 'idp-1',
  EVAL_OPENAI_SERVICE_ACCOUNT_ID: 'sa-1',
  TMPDIR: '/var/tmp/',
}

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
  const message = await codex.catalogue($).then(() => 'resolved', (err) => err.message)
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
    const message = await codex.catalogue($).then(() => 'resolved', (err) => err.message)
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

test('outside CI prepare does nothing', async () => {
  const { $, on } = stubbedHost()
  stubEnv(on,{})
  let calls = 0
  on('process.run', () => { calls++; return ok() })
  on('http.fetch', () => { calls++; return fetched(200) })
  expect(await codex.prepare($, 'run1')).toEqual({})
  expect(calls).toBe(0)
})

test('in CI prepare fetches the JWT, exchanges it and logs a per-run CODEX_HOME in', async () => {
  const { $, on } = stubbedHost()
  stubEnv(on,CI_ENV)
  const requests: any[] = []
  on('http.fetch', ($, e) => {
    requests.push(e)
    return requests.length === 1 ? fetched(200, { value: 'jwt-secret' }) : fetched(200, { access_token: 'access-secret' })
  })
  const runs: any[] = []
  on('process.run', ($, e) => {
    runs.push(e)
    return ok()
  })

  expect(await codex.prepare($, 'run1')).toEqual({ CODEX_HOME: '/var/tmp/collegium-codex-home/run1' })
  expect(requests[0].url).toBe('https://gh.example/token?api-version=2.0&audience=openai%20wif')
  expect(requests[0].init.headers.authorization).toBe('bearer request-token-secret')
  expect(requests[1].url).toBe(TOKEN_EXCHANGE_URL)
  expect(requests[1].init.method).toBe('POST')
  expect(JSON.parse(requests[1].init.body)).toEqual({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    subject_token: 'jwt-secret',
    identity_provider_id: 'idp-1',
    service_account_id: 'sa-1',
  })
  const login = runs.find((r) => r.argv[1] === 'login')
  expect(login.argv).toEqual(['codex', 'login', '--with-api-key'])
  expect(login.init.env).toEqual({ CODEX_HOME: '/var/tmp/collegium-codex-home/run1' })
  expect(login.init.stdin).toBe('access-secret')
})

test('a failed CI step names the step and status and never a token or body', async () => {
  const { $, on } = stubbedHost()
  stubEnv(on,CI_ENV)
  let failAt = 1
  let call = 0
  on('http.fetch', () => {
    call++
    if (call === failAt) return { value: { status: 401, ok: false, headers: {}, text: 'body-secret request-token-secret' } }
    return call === 1 ? fetched(200, { value: 'jwt-secret' }) : fetched(200, { access_token: 'access-secret' })
  })
  on('process.run', ($, e) => (e.argv[1] === 'login' ? exit(1) : ok()))

  const messages: string[] = []
  for (const at of [1, 2, 3]) {
    failAt = at
    call = 0
    messages.push(await codex.prepare($, 'run1').then(() => 'resolved', (err) => err.message))
  }
  expect(messages[0]).toContain('GitHub OIDC token request: HTTP 401')
  expect(messages[1]).toContain('OpenAI token exchange: HTTP 401')
  expect(messages[2]).toContain('codex login --with-api-key: exit 1')
  for (const m of messages) for (const secret of ['secret', 'jwt', 'access-']) expect(m).not.toContain(secret)
})

test('a CI request that never completes, or answers without the field, names the step', async () => {
  const { $, on } = stubbedHost()
  stubEnv(on,CI_ENV)
  on('process.run', () => ok())
  let completes = false
  on('http.fetch', () => (completes ? fetched(200, {}) : { deny: 'network down' }))

  const rejected = await codex.prepare($, 'run1').then(() => 'resolved', (err) => err.message)
  completes = true
  const empty = await codex.prepare($, 'run1').then(() => 'resolved', (err) => err.message)

  expect(rejected).toContain('GitHub OIDC token request: request did not complete')
  expect(empty).toContain('GitHub OIDC token request: HTTP 200 without value')
})

test('a CODEX_HOME that cannot be created fails the CI login', async () => {
  const { $, on } = stubbedHost()
  stubEnv(on,CI_ENV)
  let call = 0
  on('http.fetch', () => (++call === 1 ? fetched(200, { value: 'jwt-secret' }) : fetched(200, { access_token: 'access-secret' })))
  on('process.run', ($, e) => (e.argv[0] === 'mkdir' ? exit(1) : ok()))

  const message = await codex.prepare($, 'run1').then(() => 'resolved', (err) => err.message)

  expect(message).toContain('creating CODEX_HOME: exit 1')
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
