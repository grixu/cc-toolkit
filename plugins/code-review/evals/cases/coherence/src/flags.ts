import { readFile } from 'node:fs/promises';

export interface Flags {
  quietHours: boolean;
  digest: boolean;
}

export const DEFAULT_FLAGS: Flags = { quietHours: false, digest: false };

export const FLAG_RELOAD_INTERVAL_MS = 5 * 60_000;

let current: Flags = DEFAULT_FLAGS;

export function flags(): Flags {
  return current;
}

async function reload(): Promise<void> {
  const raw = JSON.parse(await readFile('flags.json', 'utf8')) as Partial<Flags>;
  current = { ...DEFAULT_FLAGS, ...raw };
}

export function startFlagReloader(): NodeJS.Timeout {
  void reload().catch((err) => console.warn('flags.json unreadable, keeping defaults', err));
  return setInterval(() => {
    reload().catch((err) => console.warn('flags.json reload failed, keeping the last flags', err));
  }, FLAG_RELOAD_INTERVAL_MS);
}
