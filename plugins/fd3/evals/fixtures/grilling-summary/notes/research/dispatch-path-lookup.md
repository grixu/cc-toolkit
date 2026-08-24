# Lookup: the current incident dispatch path

Question put to the lookup: how does `dispatchIncident` send today, and what happens to a send
that fails? Answered against the repository at the session's HEAD.

## Established

- The subscriber list is an in-process array, empty at module load and never persisted:
  `src/notify/dispatch.ts:6`.
- `dispatchIncident` awaits one `sendEmail` per subscriber in a plain `for` loop — no delay, no
  batching, no concurrency limit: `src/notify/dispatch.ts:9-11`.
- `sendEmail` is declared `Promise<boolean>` at `src/notify/dispatch.ts:14`; the loop discards the
  returned value, so a failed send leaves no trace in the process.

## Not established

- The provider's rate-limit ceiling. Nothing in the repository states one — no config key, no
  constant, no comment. The figure quoted in the incident review has no written source this lookup
  could reach.

Method: read `src/notify/dispatch.ts` whole after locating every `sendEmail` and `dispatchIncident`
reference under `src/`.
