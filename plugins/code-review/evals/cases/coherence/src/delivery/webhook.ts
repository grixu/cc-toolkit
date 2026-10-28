import { RetryPolicy } from './retry';

export const WEBHOOK_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 6;

const policy = new RetryPolicy();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function deliverWebhook(url: string, payload: unknown): Promise<void> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (res.ok) return;
    await sleep(policy.next(attempt));
  }
  throw new Error(`webhook ${url} failed after ${MAX_ATTEMPTS} attempts`);
}
