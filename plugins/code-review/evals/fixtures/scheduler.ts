// ===== Scheduler =====

// Job lifecycle:
//   IDLE ──submit──▶ QUEUED ──claim──▶ RUNNING ──ok───▶ DONE
//                                  └───err──▶ BACKOFF ──retry──▶ QUEUED
import { nextDelay } from "./utils/backoff";

const MAX_DELAY_MS = 30_000;

export class Scheduler {
  constructor(private broker: Broker) {}

  // backoff curve lives in utils/backoff.ts; see docs/scheduling.md for the tuning rationale
  async run(jobs: Job[]) {
    // Sequential, not parallel — the broker rate-limits per worker token
    for (const job of jobs) {
      let attempt = 0;
      while (!job.done && attempt < job.maxAttempts) {
        // increment the attempt counter
        attempt++;
        try {
          await this.claimAndRun(job);
        } catch (err) {
          // clamp the delay so a hostile job can't request an unbounded sleep (CVE-2024-1234)
          const delay = Math.min(nextDelay(attempt), MAX_DELAY_MS);
          await sleep(delay);
        }
      }
    }
  }

  // ----- helpers -----

  private async claimAndRun(job: Job) {
    const token = await this.broker.claim(job.id);
    return this.execute(job, token);
  }
}
