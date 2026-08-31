# Webhook delivery hardening — SPEC

**What changes:** charge processing becomes durably idempotent, `charge.settled` webhook delivery
gains outcome metrics, and the rate at which the process issues delivery attempts gains a
configurable cap that is raised once the platform egress ceiling allows.

- Ticket: PAY-231
- Status: ready for validation
- Date: 2026-07-25

This spec supersedes nothing; there are no companion documents.

## 2. Problem and goal

Idempotency keys live in process memory (`src/store/idempotency.ts:3`), so a restart forgets every
processed order and a redelivered request charges the card twice. Webhook delivery retries exist
(`src/queue/worker.ts:3`) but nothing records delivery outcomes, so a failed delivery is invisible.
The retry loop also issues its attempts back to back with no delay (`src/queue/worker.ts:6`), and
nothing coordinates concurrent `deliver` calls, so a burst of charges leaves the process with no
ceiling on the attempts it sends.

Goal: a redelivered charge request never charges twice across restarts, every webhook delivery
outcome is observable, and the attempts the process issues stay under a ceiling that can be raised
without a code change.

## 3. Design decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Charge processing stays idempotent per `orderId`** | The lookup-before-charge shape already exists (`src/billing/charge.ts:16`); this spec only makes the store durable. Cost accepted: one storage dependency where today there is none. |
| D2 | **Idempotency keys are stored in Postgres** | The service already holds a `DATABASE_URL` and the orders schema lives there; Redis would add a second stateful dependency for the same guarantee. Cost accepted: key reads join the existing database's load. |
| D3 | **Delivery retries stay capped at 5 attempts** | The cap already exists (`src/queue/worker.ts:3`) and no incident has needed more. Raising it would only delay surfacing a dead merchant endpoint. |
| D4 | **Webhook processing stays queued, off the request path** | The queue worker already owns delivery (`src/queue/worker.ts:6`); moving it into the request path would put merchant endpoint latency on the charge response. Cost accepted: the merchant learns the outcome asynchronously. |
| D5 | **One process-wide cap on attempts per second, set by config and raised in phase 2** | The retry loop applies no delay (`src/queue/worker.ts:6`) and concurrent `deliver` calls do not see each other, so a per-event delay would not bound what the process sends; the cap has to be shared module state. A config value moves it without a deploy of new code. `8` per second is the largest value that stays safely under the lowest egress ceiling anyone has quoted, pending confirmation (the declared gap in section 4). Cost accepted: at the phase-1 value of `1` a burst drains more slowly than it does today. |
| D6 | **Delivery outcomes are counted in the process, not scraped** | The repository holds four modules and no HTTP surface, so a scraped endpoint would be a second change with its own contract; an exported counter is verifiable by the test runner `package.json` already names. Cost accepted: the counts are per process and are lost on restart. |

**Risks accepted**

| Risk | What it costs if it lands | Mitigation |
|---|---|---|
| `idempotency_keys` grows without bound — nothing in this spec deletes rows, and section 9 adds no cleanup. | Table size grows with order volume, and index maintenance cost rises with it. | One row per order and the primary key as the only index; a retention policy is a later change, not a blocker for this spec. |
| A provider charge that succeeds and whose key write then fails leaves the card charged with no key stored, so a redelivery charges twice. D1 keeps the existing lookup-before-charge order (`src/billing/charge.ts:16`). | One duplicate charge per occurrence, refunded by hand. | The write is retried once and then rethrown as `IdempotencyWriteFailed` rather than swallowed, so the window is visible when it opens. Closing it entirely needs reserve-before-charge, which this spec does not do. |
| Phase 1 caps the process at `1` attempt per second, below what it issues today, and phase 2 cannot start until the platform team confirms the ceiling (the declared gap in section 4). | A burst of charges takes longer to deliver for as long as phase 1 lasts; merchants learn outcomes later. | Retries stay capped at 5 attempts (D3), so a slow burst still terminates; the counter from OBSERVABILITY-1 shows the backlog while it lasts, and phase 2 raises the cap as soon as the confirmation lands. |
| OBSERVABILITY-1's counts live in process memory (D6) and reset on every restart. | A restart during an incident loses the delivery history up to that point. | The counts are a rate signal, not a ledger: what phase 2's criterion reads is the slope over seconds, which survives any restart that is not mid-burst. |

## 4. Target architecture

### DB-1 — durable idempotency key store

Replaces the in-memory `Map` in `src/store/idempotency.ts`. Contract:

- Table `idempotency_keys` with columns `order_id TEXT PRIMARY KEY`, `charge_id TEXT NOT NULL`,
  `status TEXT NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- Reads and writes go through the existing `getIdempotencyKey` / `saveIdempotencyKey` functions;
  their signatures do not change.
- Errors: a store read failure throws `IdempotencyStoreUnavailable` out of `getIdempotencyKey`; a
  write failure after a successful provider charge is retried once, then logged and rethrown as
  `IdempotencyWriteFailed`. Neither is caught inside `charge` (`src/billing/charge.ts:15`), which
  has no error path today and gains none here.
- Auth: the service's existing database credentials; no new principal.
- Dependencies: the `pg` client and `node-pg-migrate` for the migration, both new —
  `package.json` declares no dependencies today.
- Limits: none beyond the primary key. Rows accumulate; nothing in this spec deletes them.

### OBSERVABILITY-1 — delivery metrics

Counter `webhook_delivery_attempts_total`, held in module scope in `src/queue/worker.ts`,
incremented by `deliver` (`src/queue/worker.ts:5`) after each attempt under the outcome that
attempt had, and read through a new exported `deliveryMetrics()`.

- Fields: two counts, `delivered` and `failed`, returned as one object.
- Errors: incrementing cannot fail; it is an in-process integer add.
- Auth: none — in-process, no new principal.
- Limits: the counts are per process and start at zero on every restart (D6).

### CONFIG-1 — delivery attempt rate cap

New config value `DELIVERY_RATE_LIMIT`: the maximum delivery attempts per second the whole process
issues. One token bucket in module scope in `src/queue/worker.ts`, refilled at that rate and shared
by every `deliver` call; each attempt in the retry loop (`src/queue/worker.ts:6`) takes a token
first and waits when the bucket is empty. `DELIVERY_RATE_LIMIT` is read from `process.env` when the
module loads and held for the life of the process.

- Fields: one integer environment variable, attempts per second. Default `1`, the phase-1 value.
- Errors: a value that is not a positive integer throws a named error at module load, never a
  silent fallback.
- Auth: none — deploy-manifest configuration.
- Limits: phase 2 sets it to `8`; values above `8` are rejected until the egress ceiling is
  confirmed.

### Declared gap

**The platform egress rate-limit ceiling is unconfirmed.** The value `8` in D5 and CONFIG-1 rests
on the lowest quoted ceiling, not on a confirmed number — owner: platform team, placement: gate
before phase 2 (phase 2 does not start until the platform team confirms the ceiling).

### Prerequisites

| Prerequisite | Status |
|---|---|
| Postgres reachable from the service, with a `DATABASE_URL` in the deploy manifest | asserted by the payments team; not verifiable from this repository, which holds no manifest — owner: payments team, placement: confirmed before the phase-1 deploy |

## 5. Ownership

| Repository / component | Owns | Apply mechanism |
|---|---|---|
| payments-service (this repository) | everything in this spec | pull request, CI deploy on merge to `main` |

All paths in this spec are owned by the payments team; review is one approval from that team, and
CI applies the deploy — no human runs anything by hand.

## 6. The change, per repository

### payments-service

1. **DB-1** — new: migration adding `idempotency_keys`, plus rewiring `getIdempotencyKey` /
   `saveIdempotencyKey` (`src/store/idempotency.ts:5`, `src/store/idempotency.ts:9`) to the table.
2. **OBSERVABILITY-1** — new: module-scope counts in `src/queue/worker.ts`, incremented inside the
   retry loop (`src/queue/worker.ts:6`) once per attempt, plus the exported `deliveryMetrics()`.
3. **CONFIG-1** — new: the module-scope token bucket in `src/queue/worker.ts`, read from
   `process.env` at module load, with the retry loop (`src/queue/worker.ts:6`) taking a token per
   attempt.
4. **Dependencies** — `package.json` declares none today: `pg` and `node-pg-migrate` for DB-1, and
   `vitest` as a dev dependency for the checks in section 8, which the existing `test` script
   already invokes.

Items 1–3 are independent — none reads anything another introduces — so they may land in any order
within the phase; item 4 lands with or before whichever of them needs it.

## 7. Rollout

| # | Phase | Where | Switches anything? | Gate after? |
|---|---|---|---|---|
| 1 | All four work items land and deploy together, `DELIVERY_RATE_LIMIT=1` | payments-service | yes — the store becomes durable, the counts start, and the process is capped at 1 attempt per second | yes — phase 2 waits on the platform team's ceiling confirmation, so phase 1 closes its landing unit: one branch, one pull request |
| 2 | Set `DELIVERY_RATE_LIMIT=8` in the deploy manifest | payments-service | yes — the cap rises to 8 attempts per second | yes — the final phase, so it closes its unit |

Single environment; each phase is one deploy. Phase 2 follows phase 1 after at least three days of
clean `webhook_delivery_attempts_total` readings — long enough to cover a weekly traffic peak.

Hard dependency: **the platform team's confirmation of the egress rate-limit ceiling gates phase
2** (the declared gap in section 4). The gate is a confirmation, not a merge or a deploy.

Rollback: phase 1 — revert the merge commit and redeploy; the `idempotency_keys` table stays
behind, unused. Phase 2 — set `DELIVERY_RATE_LIMIT=1` and redeploy; the reversal is complete when
`webhook_delivery_attempts_total` climbs at its phase-1 rate again.

## 8. Verification

- **DB-1** — probe: `psql "$DATABASE_URL" -c "\d idempotency_keys"` lists the four columns. Before
  the change the same command errors with `did not find any relation`.
- **OBSERVABILITY-1** — triggered, through `npm test` (`vitest run`, the script `package.json`
  defines): deliver one event against an endpoint that accepts and one against an endpoint that
  always refuses, then assert `deliveryMetrics()` returns `delivered: 1` and `failed: 5`. Before
  the change the export does not exist.
- **CONFIG-1** — triggered, through the same test run: importing the module with
  `DELIVERY_RATE_LIMIT=abc` throws the named error; with `DELIVERY_RATE_LIMIT=1`, two events
  delivered concurrently against an endpoint that always refuses take at least nine seconds for
  their ten attempts, which is what a per-event delay would not produce. Before the change both are
  instant and neither reads the variable.

Phase 1 is verified when the DB-1 probe and the two triggered checks above pass; phase 2 by
`deliveryMetrics()` climbing at up to 8 attempts per second under a synthetic 100-event burst,
where phase 1 held the same burst to 1.

## 9. Cleanup

The subject has no cleanup: nothing is deleted, and the only irreversible artifact (the
`idempotency_keys` table) is additive.

## 10. Out of scope

- **Refund webhooks** — owner: payments team, placement: ticket PAY-244.
- **Invoice PDF rendering** — owner: billing team, placement: ticket PAY-251.

## 11. Tickets

PAY-231 exists and tracks this spec. PAY-244 and PAY-251 exist and hold the two exclusions. No new
tickets are needed.

## 12. Appendix — the evidence record

| Claim | How it was verified |
|---|---|
| Idempotency keys are in-memory today | `src/store/idempotency.ts:3` — `const keys = new Map<...>()` |
| Charge processing checks the key before charging | `src/billing/charge.ts:16` — `getIdempotencyKey` called before `callProvider` |
| Delivery retries cap at 5 attempts | `src/queue/worker.ts:3` — `MAX_DELIVERY_ATTEMPTS = 5` |
| The retry loop applies no delay between attempts, and nothing bounds concurrent calls | `src/queue/worker.ts:6` — the `for` loop awaits `post` and retries immediately; no timer, no backoff and no module-scope state in the file |
| The repository holds no HTTP surface, no metrics endpoint and no environment read | `git ls-files` returns 7 files; no server, route, `/metrics` handler or `process.env` access anywhere under `src/` |
| `package.json` declares no dependencies | `package.json` — `scripts.test` only; no `dependencies` and no `devDependencies` block |
| Webhook enqueueing already exists | `src/webhooks/enqueue.ts:8` — `enqueueWebhook` |
| The store functions are the only key readers/writers | `grep -rn "getIdempotencyKey\|saveIdempotencyKey" src/` — hits only in `src/store/idempotency.ts` and `src/billing/charge.ts` |
| The egress rate-limit ceiling supports 8 attempts per second | Unconfirmed — no documentation states the ceiling; treated as a declared gap, owner: platform team, placement: gate before phase 2 |
