# Grilling closing summary — rate-limited incident email dispatch

Session of 2026-07-29. Every settled decision below carries its rationale and the cost the user
accepted. The user's closing message: **"Confirmed — shared understanding reached, write it up."**

## Settled decisions

1. **Dispatch becomes rate-limited through an in-process token bucket, one bucket for the whole
   process.** Rationale: today `dispatchIncident` sends sequentially and unthrottled
   (`src/notify/dispatch.ts:9-11`), and the provider throttles us during large incidents; an
   in-process bucket needs no new infrastructure. Cost accepted: the limit is per process, so
   running a second instance doubles the effective send rate — accepted because the service runs
   as a single instance by deliberate choice.
2. **The bucket's ceiling comes from a new `SEND_RATE_PER_SECOND` config value, default 10.**
   Rationale: the provider's exact ceiling is unconfirmed (declared gap 1), so the value must be
   changeable without a code change; 10/s is the most conservative figure quoted in the incident
   review. Cost accepted: a wrong default until the ceiling is confirmed.
3. **Failed sends land in a new `dispatch_log` table and are retried on the next dispatch tick,
   at most once per incident per subscriber.** Rationale: today a failed send is silently dropped
   (`sendEmail` returns a boolean nobody reads, `src/notify/dispatch.ts:10`); a log table makes
   failures visible and gives retries a source of truth. Cost accepted: one new table and a write
   per send.
4. **Minor and major incidents share the same bucket — no priority lane.** Rationale: followed
   from the user's answer that subscribers must never observe reordering within one incident's
   emails; a priority lane reorders. Cost accepted: a burst of minor incidents can delay a major
   one's emails by up to the bucket depth.
5. **The change ships dark behind a `rateLimitedDispatch` flag (default off), then the flag flips
   in a second step.** Rationale: the dispatch path is customer-visible and the bucket's ceiling
   is still unconfirmed; dark shipping decouples landing the code from changing behaviour. Cost
   accepted: two releases instead of one.

## Elements the spec must define

- The token bucket module wrapping the send loop in `src/notify/dispatch.ts`.
- The `dispatch_log` table: `incident_id`, `recipient`, `attempt`, `delivered`, `finished_at`.
- The `SEND_RATE_PER_SECOND` config value (integer, default 10, startup-validated).
- The `rateLimitedDispatch` flag (boolean, default off).

## Rollout, as settled

Two phases. Phase 1: everything lands and deploys with the flag off — no behaviour change.
Phase 2: the flag flips on. Environment order: **sandbox first, then live, with two working days
between them** — long enough to see one synthetic large-incident drill pass in sandbox.

## Verification, as settled

- Bucket: a unit probe driving 100 sends through the bucket at ceiling 10 finishes in no less
  than 9 seconds (before the change: immediately).
- `dispatch_log`: `psql` describe shows the five columns; a forced send failure writes a row with
  `delivered = false`.
- Flag off: dispatch behaviour is byte-identical to today (the existing dispatch tests pass
  unchanged).

## Declared gaps (both confirmed as gaps by the user)

1. **The provider's exact rate-limit ceiling is unconfirmed.** Owner: platform team. Placement:
   gate before phase 2 — the flag does not flip until the ceiling is confirmed in writing.
2. **The retention period for `dispatch_log` rows is undecided.** Owner: data team. Placement:
   ticket OPS-77.

## Decisions I took that you never answered directly

- Decision 4 (no priority lane) was never asked as its own question; it followed from your answer
  on ordering within one incident. You ratified it in the closing confirmation.

## Facts established during the session

- Dispatch is sequential and unthrottled: `src/notify/dispatch.ts:9-11`.
- Send failures are currently invisible: the boolean from `sendEmail`
  (`src/notify/dispatch.ts:14`) is never read.
- The subscriber list is in-process only: `src/notify/dispatch.ts:6`.
- Ticket OPS-77 exists in the tracker and is owned by the data team.
