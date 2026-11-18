// Every harness-specific fact lives behind this contract: runs, choice and the tools never name a CLI flag.

export interface Model {
  id: string // provider/model
  hidden: boolean
  efforts: string[]
  defaultEffort: string
}

export interface Palette {
  provider: string
  models: Model[]
}

export type ProcessResult = { exitCode: number; stdout: string; stderr: string }

export function withoutTrailingSlash(path: string): string {
  return path.replace(/\/+$/, '')
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export type RunEvent ={ kind: 'message' | 'command' | 'warning' | 'failed'; text: string; at: number }

export interface RunSpec {
  runDir: string
  // The harness's own working directory: the caller's checkout, or the run's worktree in a write mode.
  dir: string
  write: boolean
  prompt: string
  schemaPath: string
  model?: string // provider/model; absent leaves the harness's configured default
  effort?: string
  env: Record<string, string> // what prepare returned for this run
}

export interface HarnessAdapter {
  id: string
  detect($): Promise<{ installed: boolean; version?: string; path?: string }>
  catalogue($): Promise<Palette[]>
  prepare($, runId: string): Promise<Record<string, string>>
  loginStatus($, env: Record<string, string>): Promise<{ loggedIn: boolean; fix: string }>
  invocation(run: RunSpec): { argv: string[]; env: Record<string, string>; cwd: string }
  parseEvent(line: string): RunEvent | null
  finalMessage($, runDir: string): Promise<string | null>
}
