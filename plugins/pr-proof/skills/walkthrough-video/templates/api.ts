// Mirrors the repo's e2e helpers instead of importing them: they load the repo's own @playwright/test,
// and Playwright refuses a second copy.
import fs from 'node:fs';
import path from 'node:path';
import { APIRequestContext, expect, request as playwrightRequest } from '@playwright/test';

export const API_URL = process.env.API_URL ?? 'http://localhost:3000';
export const STATE_DIR = path.join(__dirname, '..', '.state');
export const STORAGE_STATE = path.join(STATE_DIR, 'storage.json');
export const RUN_FILE = path.join(STATE_DIR, 'run.json');
// Outside .state, which the cleanup deletes: an entry teardown has not reverted yet must survive it.
export const LEDGER_FILE = path.join(__dirname, '..', '..', 'teardown-ledger.jsonl');

const CREDENTIALS_FILE = '<checkout>/e2e-playwright/credentials/local.json';

// Values never leave this process: no logging, no copying into run state.
export const credentials: Record<string, string> = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));

export type LedgerEntry = {
  change: string;
  revert: { method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string; data?: unknown };
};

export async function loggedInContext(email: string, password: string): Promise<APIRequestContext> {
  const context = await playwrightRequest.newContext({ baseURL: API_URL });
  const response = await context.post('/oauth/login', { data: { email, password } });
  expect(response.ok(), `login failed with ${response.status()}`).toBeTruthy();

  return context;
}

export function writeRunState(state: object): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(RUN_FILE, JSON.stringify(state));
}

export function readRunState<T>(): T {
  return JSON.parse(fs.readFileSync(RUN_FILE, 'utf8'));
}

// Call right after the change happens, so a take that dies mid-way still leaves its revert behind.
export function appendLedger(entry: LedgerEntry): void {
  fs.appendFileSync(LEDGER_FILE, `${JSON.stringify(entry)}\n`);
}

export function readLedger(): LedgerEntry[] {
  if (!fs.existsSync(LEDGER_FILE)) {
    return [];
  }

  return fs.readFileSync(LEDGER_FILE, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
}
