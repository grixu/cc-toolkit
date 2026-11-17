import { withoutTrailingSlash, type HarnessAdapter, type Palette, type ProcessResult, type RunEvent, type RunSpec } from './harness.ts'

const PROVIDER = 'openai'
const LOGIN_FIX = '! codex login'
export const TOKEN_EXCHANGE_URL = 'https://auth.openai.com/oauth/token'

function exitDetail(r: ProcessResult | undefined): string {
  return `exit ${r?.exitCode ?? 'n/a'}`
}

async function run($, argv: string[], init: Record<string, unknown> = {}): Promise<ProcessResult | undefined> {
  return $.process.run(argv, { stdin: '', timeoutMs: 60_000, ...init }).catch(() => undefined)
}

async function detect($) {
  const r = await run($, ['codex', '--version'])
  if (r?.exitCode !== 0) return { installed: false }
  const version = r.stdout.trim().split(/\s+/).pop()
  return version ? { installed: true, version } : { installed: true }
}

function parseCatalogue(stdout: string): Palette[] {
  const models = JSON.parse(stdout).models
  if (!Array.isArray(models)) throw new Error('no models array')
  return [
    {
      provider: PROVIDER,
      models: models.map((m) => {
        if (
          typeof m?.slug !== 'string' ||
          typeof m.default_reasoning_level !== 'string' ||
          !Array.isArray(m.supported_reasoning_levels) ||
          !m.supported_reasoning_levels.every((l) => typeof l?.effort === 'string')
        ) {
          throw new Error('model without slug or efforts')
        }
        return {
          id: `${PROVIDER}/${m.slug}`,
          hidden: m.visibility === 'hide',
          efforts: m.supported_reasoning_levels.map((l) => String(l.effort)),
          defaultEffort: String(m.default_reasoning_level),
        }
      }),
    },
  ]
}

// `codex debug models` is a diagnostic command whose JSON may change without notice, so a failure names the version.
async function catalogue($): Promise<Palette[]> {
  const r = await run($, ['codex', 'debug', 'models'])
  try {
    if (r?.exitCode !== 0) throw new Error(exitDetail(r))
    return parseCatalogue(r.stdout)
  } catch (err) {
    const { version } = await detect($)
    throw new Error(`cannot read the Codex model catalogue (codex ${version ?? 'unknown version'}): ${(err as Error).message}`)
  }
}

function ciFailure(step: string, detail: string): Error {
  return new Error(`Codex CI login failed at ${step}: ${detail}`)
}

async function fetchTokenField($, step: string, url: string, init: Record<string, unknown>, field: string): Promise<string> {
  const res = await $.http.fetch(url, init).catch(() => undefined)
  if (!res) throw ciFailure(step, 'request did not complete')
  if (!res.ok) throw ciFailure(step, `HTTP ${res.status}`)
  let value: unknown
  try {
    value = JSON.parse(res.text)?.[field]
  } catch {
    value = undefined
  }
  if (typeof value !== 'string' || value === '') throw ciFailure(step, `HTTP ${res.status} without ${field}`)
  return value
}

// Errors here name the step and status only: a token, JWT or response body must never reach a log.
async function prepare($, runId: string): Promise<Record<string, string>> {
  const requestToken = (await $.env.get('EVAL_ACTIONS_ID_TOKEN_REQUEST_TOKEN')) ?? ''
  if (requestToken === '') return {}
  const requestUrl = (await $.env.get('EVAL_ACTIONS_ID_TOKEN_REQUEST_URL')) ?? ''
  const audience = (await $.env.get('EVAL_OPENAI_WIF_AUDIENCE')) ?? ''
  const identityProviderId = (await $.env.get('EVAL_OPENAI_IDENTITY_PROVIDER_ID')) ?? ''
  const serviceAccountId = (await $.env.get('EVAL_OPENAI_SERVICE_ACCOUNT_ID')) ?? ''
  // A hooks module has no Node, so the OS temp dir comes from the environment.
  const tmp = withoutTrailingSlash((await $.env.get('TMPDIR')) || '/tmp')
  const home = `${tmp}/collegium-codex-home/${runId}`

  const jwt = await fetchTokenField(
    $,
    'the GitHub OIDC token request',
    `${requestUrl}&audience=${encodeURIComponent(audience)}`,
    { method: 'GET', headers: { authorization: `bearer ${requestToken}` } },
    'value',
  )
  const accessToken = await fetchTokenField(
    $,
    'the OpenAI token exchange',
    TOKEN_EXCHANGE_URL,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
        subject_token: jwt,
        identity_provider_id: identityProviderId,
        service_account_id: serviceAccountId,
      }),
    },
    'access_token',
  )

  // Codex refuses a CODEX_HOME that does not exist yet.
  const mkdir = await run($, ['mkdir', '-p', home])
  if (mkdir?.exitCode !== 0) throw ciFailure('creating CODEX_HOME', exitDetail(mkdir))
  const login = await run($, ['codex', 'login', '--with-api-key'], { env: { CODEX_HOME: home }, stdin: accessToken })
  if (login?.exitCode !== 0) throw ciFailure('codex login --with-api-key', exitDetail(login))
  return { CODEX_HOME: home }
}

async function loginStatus($, env: Record<string, string>) {
  const r = await run($, ['codex', 'login', 'status'], { env })
  return { loggedIn: r?.exitCode === 0, fix: LOGIN_FIX }
}

function invocation(spec: RunSpec) {
  const argv = [
    'codex',
    'exec',
    '--skip-git-repo-check',
    '-C',
    spec.dir,
    '-s',
    spec.write ? 'workspace-write' : 'read-only',
  ]
  if (spec.model) argv.push('-m', spec.model.replace(new RegExp(`^${PROVIDER}/`), ''))
  if (spec.effort) argv.push('-c', `model_reasoning_effort=${spec.effort}`)
  argv.push('--json', '-o', `${spec.runDir}/last.json`, '--output-schema', `${spec.runDir}/schema.json`, spec.prompt)
  return { argv, env: { ...spec.env }, cwd: spec.runDir }
}

function parseEvent(line: string): RunEvent | null {
  let e
  try {
    e = JSON.parse(line)
  } catch {
    return null
  }
  const at = Date.now()
  if (e?.type === 'turn.failed') return { kind: 'failed', text: String(e.error?.message ?? 'turn failed'), at }
  // Codex reports config deprecations as `error` events and items on runs that still succeed.
  if (e?.type === 'error') return { kind: 'warning', text: String(e.message ?? ''), at }
  if (e?.type !== 'item.completed') return null
  const item = e.item ?? {}
  if (item.type === 'agent_message') return { kind: 'message', text: String(item.text ?? ''), at }
  if (item.type === 'command_execution') return { kind: 'command', text: String(item.command ?? ''), at }
  if (item.type === 'error') return { kind: 'warning', text: String(item.message ?? ''), at }
  return null
}

async function finalMessage($, runDir: string): Promise<string | null> {
  const text = await $.fs.read(`${runDir}/last.json`).catch(() => null)
  return typeof text === 'string' && text.trim() !== '' ? text : null
}

export const codex: HarnessAdapter = { id: 'codex', detect, catalogue, prepare, loginStatus, invocation, parseEvent, finalMessage }
