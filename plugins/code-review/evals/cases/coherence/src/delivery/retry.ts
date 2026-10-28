const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 5 * 60_000;

export class RetryPolicy {
  next(attempt: number): number {
    return Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
  }
}
