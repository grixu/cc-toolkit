# Plan: add exponential backoff to the retry helper

`withRetry` in `src/retry.ts` retries immediately on failure, which hammers the supplier API when
it is already struggling. The helper currently caps at 3 attempts, so a brief supplier outage
exhausts the retries within milliseconds.

Proposal:

- Keep the attempt cap as it is.
- Add exponential backoff between attempts. Base delay, multiplier and whether to add jitter are
  open.
- Possibly add a maximum total delay so a sync job cannot hang for minutes.
- Open question: should the backoff parameters be hardcoded or configurable per call site?
  `syncCatalog` (`src/jobs/sync.ts`) is the only caller today.
