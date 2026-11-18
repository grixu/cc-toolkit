import {
  catalogue as codexCatalogue,
  detect as codexDetect,
  finalMessage as codexFinalMessage,
  loginStatus as codexLoginStatus,
  prepare as codexPrepare,
} from './codex.ts'
import type { HarnessAdapter, Palette } from './harness.ts'

// The hooks validator lets `$` reach only a top-level or imported function, never an object's method, so every
// adapter call that needs `$` dispatches here on the adapter id.

function unknownHarness(adapter: HarnessAdapter): never {
  throw new Error(`unknown harness ${adapter.id}`)
}

export async function detect($, adapter: HarnessAdapter): ReturnType<HarnessAdapter['detect']> {
  if (adapter.id === 'codex') return codexDetect($)
  return unknownHarness(adapter)
}

export async function catalogue($, adapter: HarnessAdapter): Promise<Palette[]> {
  if (adapter.id === 'codex') return codexCatalogue($)
  return unknownHarness(adapter)
}

export async function prepare($, adapter: HarnessAdapter, runId: string): Promise<Record<string, string>> {
  if (adapter.id === 'codex') return codexPrepare($, runId)
  return unknownHarness(adapter)
}

export async function loginStatus($, adapter: HarnessAdapter, env: Record<string, string>): ReturnType<HarnessAdapter['loginStatus']> {
  if (adapter.id === 'codex') return codexLoginStatus($, env)
  return unknownHarness(adapter)
}

export async function finalMessage($, adapter: HarnessAdapter, runDir: string): Promise<string | null> {
  if (adapter.id === 'codex') return codexFinalMessage($, runDir)
  return unknownHarness(adapter)
}
