import type { HarnessAdapter, Palette, ProcessResult, RunEvent, RunSpec } from './harness.ts'

const PROVIDER = 'openai'
const LOGIN_FIX = '! codex login'

function exitDetail(r: ProcessResult | undefined): string {
  return `exit ${r?.exitCode ?? 'n/a'}`
}

async function run($, argv: string[], init: Record<string, unknown> = {}): Promise<ProcessResult | undefined> {
  return $.process.run(argv, { stdin: '', timeoutMs: 60_000, ...init }).catch(() => undefined)
}

export async function detect($) {
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
export async function catalogue($): Promise<Palette[]> {
  const r = await run($, ['codex', 'debug', 'models'])
  try {
    if (r?.exitCode !== 0) throw new Error(exitDetail(r))
    return parseCatalogue(r.stdout)
  } catch (err) {
    const { version } = await detect($)
    throw new Error(`cannot read the Codex model catalogue (codex ${version ?? 'unknown version'}): ${(err as Error).message}`)
  }
}

export async function prepare($, runId: string): Promise<Record<string, string>> {
  return {}
}

export async function loginStatus($, env: Record<string, string>) {
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
  argv.push('--json', '-o', `${spec.runDir}/last.json`, '--output-schema', spec.schemaPath, spec.prompt)
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

export async function finalMessage($, runDir: string): Promise<string | null> {
  const text = await $.fs.read(`${runDir}/last.json`).catch(() => null)
  return typeof text === 'string' && text.trim() !== '' ? text : null
}

export const codex: HarnessAdapter = { id: 'codex', detect, catalogue, prepare, loginStatus, invocation, parseEvent, finalMessage }
