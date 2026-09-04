# Webhook delivery hardening — SPEC

**What changes:** charge processing becomes durably idempotent and `charge.settled` webhook
delivery gains outcome metrics.

- Ticket: PAY-231
- Status: ready for validation
- Date: 2026-07-25

This spec supersedes nothing; there are no companion documents.

## 2. Problem and goal

Idempotency keys live in process memory (`src/store/idempotency.ts:3`), so a restart forgets every
processed order and a redelivered request charges the card twice. Webhook delivery retries exist
(`src/queue/worker.ts:3`) but nothing records delivery outcomes, so a failed delivery is invisible.

Goal: a redelivered charge request never charges twice across restarts, and every webhook delivery
outcome is observable.

## 3. Design decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Charge processing stays idempotent per `orderId`** | The lookup-before-charge shape already exists (`src/billing/charge.ts:16`); this spec only makes the store durable. Cost accepted: one storage dependency where today there is none. |
| D2 | **Idempotency keys are stored in Postgres** | The service already holds a `DATABASE_URL` and the orders schema lives there — both asserted by the payments team, neither verifiable from this repository (section 4 prerequisites); Redis would add a second stateful dependency for the same guarantee. Cost accepted: key reads join the existing database's load. |
| D3 | **Delivery retries stay capped at 5 attempts** | The cap already exists (`src/queue/worker.ts:3`) and no incident has needed more. Raising it would only delay surfacing a dead merchant endpoint. |
| D4 | **Webhook processing stays queued, off the request path** | The queue worker already owns delivery (`src/queue/worker.ts:6`); moving it into the request path would put merchant endpoint latency on the charge response. Cost accepted: the merchant learns the outcome asynchronously. |
| D5 | **Delivery outcomes are counted in the process, not scraped** | The repository holds four modules and no HTTP surface, so a scraped endpoint would be a second change with its own contract; an exported counter is verifiable by the test runner `package.json` already names. Cost accepted: the counts are per process and are lost on restart. |

**Risks accepted**

| Risk | What it costs if it lands | Mitigation |
|---|---|---|
| `idempotency_keys` grows without bound — nothing in this spec deletes rows, and section 9 adds no cleanup. | Table size grows with order volume, and index maintenance cost rises with it. | One row per order and the primary key as the only index, so the table grows linearly with orders and carries no secondary index to maintain. This is accepted, not deferred: nothing in this spec deletes rows and section 9 says so. |
| A provider charge that succeeds and whose key write then fails leaves the card charged with no key stored, so a redelivery charges twice. D1 keeps the existing lookup-before-charge order (`src/billing/charge.ts:16`). | One duplicate charge per occurrence, refunded by hand. | The write is retried once and the failure is surfaced as HTTP 500 rather than swallowed, so the window is visible when it opens. Closing it entirely needs reserve-before-charge, which this spec does not do. |

## 4. Target architecture

### DB-1 — durable idempotency key store

Replaces the in-memory `Map` in `src/store/idempotency.ts`. Contract:

- Table `idempotency_keys` with columns `order_id TEXT PRIMARY KEY`, `charge_id TEXT NOT NULL`,
  `status TEXT NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- Reads and writes go through the existing `getIdempotencyKey` / `saveIdempotencyKey` functions;
  their signatures do not change.
- Errors: a store read failure fails the charge request with HTTP 503; a write failure after a
  successful provider charge is retried once, then logged and surfaced as HTTP 500. Nothing in this
  repository serves charges today — `charge` (`src/billing/charge.ts:15`) has no caller — so the
  store raises and these statuses are the mapping the request path will apply when it lands; owner:
  payments team, placement: ticket PAY-262, alongside the wiring (section 10).
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
- Dependencies: none at runtime — module-scope integers and one new export, no client and no
  registry (D5). The section 8 check runs under the test runner section 6 introduces.
- Limits: the counts are per process and start at zero on every restart (D5). Only `delivered` is
  exercisable here — `post` (`src/queue/worker.ts:14`) returns `true` unconditionally, so nothing in
  this repository can produce a failed attempt; a transport that can fail is out of scope
  (section 10).

### Prerequisites

| Prerequisite | Status |
|---|---|
| Postgres reachable from the service, with a `DATABASE_URL` in the deploy manifest, and the orders schema in that same database (D2) | asserted by the payments team; not verifiable from this repository, which holds no manifest and reads no environment variable — owner: payments team, placement: confirmed before the deploy |

## 5. Ownership

| Repository / component | Owns | Apply mechanism |
|---|---|---|
| payments-service (this repository) | everything in this spec | pull request, CI deploy on merge to `main` |

All paths in this spec are owned by the payments team; review is one approval from that team, and
CI applies the deploy — no human runs anything by hand. The pipeline is asserted by the payments
team: this repository tracks no CI configuration, so nothing here shows it — owner: payments team,
placement: confirmed before the deploy.

## 6. The change, per repository

### payments-service

1. **DB-1** — new: migration adding `idempotency_keys`, plus rewiring `getIdempotencyKey` /
   `saveIdempotencyKey` (`src/store/idempotency.ts:5`, `src/store/idempotency.ts:9`) to the table.
   The CI deploy on merge to `main` (section 5) applies the migration; no human runs it.
2. **OBSERVABILITY-1** — new: module-scope counts incremented inside the retry loop
   (`src/queue/worker.ts:6`), once per attempt, plus the `deliveryMetrics()` export.
3. **Dependencies** — `package.json` declares none today: `pg` and `node-pg-migrate` for DB-1, and
   `vitest` as a dev dependency for the check in section 8, which the existing `test` script
   already invokes.

Items 1 and 2 are independent — neither reads anything the other introduces — so they may land in
any order; item 3 lands with or before whichever of them needs it.

## 7. Rollout

| # | Phase | Where | Switches anything? | Gate after? |
|---|---|---|---|---|
| 1 | Both work items land and deploy together | payments-service | yes — the store becomes durable and the counts start | yes — the final phase, so it closes its landing unit: one branch, one pull request |

Single environment; the deploy on merge is the rollout. No waiting period: the change is exercised
by the next charge request.

Hard dependency: **the payments team's confirmation that Postgres is reachable and the deploy
manifest carries `DATABASE_URL`** (section 4 prerequisites). The gate is a confirmation before the
deploy, not a merge.

Rollback: revert the merge commit and redeploy through the same pipeline (section 5). The `idempotency_keys` table stays behind, unused,
and nothing in this spec drops it — section 9 says so, and rollback does not change that.

## 8. Verification

- **DB-1** — probe: `psql "$DATABASE_URL" -c "\d idempotency_keys"` lists the four columns. Before
  the change the same command errors with `did not find any relation`.
- **OBSERVABILITY-1** — triggered, through `npm test` (`vitest run`, the script `package.json`
  defines): call `deliver` on two events, then assert `deliveryMetrics()` returns `delivered: 2`.
  Before the change the export does not exist. The `failed` count is not exercised — nothing here
  can make a delivery fail (section 10).

Phase 1 is verified when both checks above pass.

## 9. Cleanup

The subject has no cleanup: nothing is deleted, and the only irreversible artifact (the
`idempotency_keys` table) is additive.

## 10. Out of scope

- **Wiring the worker into the service** — `deliver` has no caller and nothing imports
  `src/queue/worker.ts`; owner: payments team, placement: ticket PAY-262.
- **A delivery transport that can fail** — `post` (`src/queue/worker.ts:14`) returns `true`
  unconditionally, so no delivery can fail today; owner: payments team, placement: ticket PAY-262,
  alongside the wiring that makes it reachable.
- **Refund webhooks** — owner: payments team, placement: ticket PAY-244.
- **Invoice PDF rendering** — owner: billing team, placement: ticket PAY-251.

## 11. Tickets

PAY-231 exists and tracks this spec. PAY-244, PAY-251 and PAY-262 exist and hold the four
exclusions. No new tickets are needed. All four are asserted by the payments team: this repository
carries no tracker configuration, so no ticket state is checkable from it — owner: payments team,
placement: confirmed before the deploy.

## 12. Appendix — the evidence record

| Claim | How it was verified |
|---|---|
| Idempotency keys are in-memory today | `src/store/idempotency.ts:3` — `const keys = new Map<...>()` |
| Charge processing checks the key before charging | `src/billing/charge.ts:16` — `getIdempotencyKey` called before `callProvider` |
| Delivery retries cap at 5 attempts | `src/queue/worker.ts:3` — `MAX_DELIVERY_ATTEMPTS = 5` |
| The repository holds no HTTP surface, no metrics endpoint and no environment read | `git ls-files` returns 7 files; no server, route, `/metrics` handler or `process.env` access anywhere under `src/` |
| `package.json` declares no dependencies | `package.json` — `scripts.test` only; no `dependencies` and no `devDependencies` block |
| Nothing calls `deliver` and nothing imports the worker module | No `import` of `src/queue/worker` anywhere under `src/`; `deliver` (`src/queue/worker.ts:5`) is exported and unreferenced |
| No delivery can fail today | `src/queue/worker.ts:14` — `post` ignores its argument and returns `true`; it is module-private with no injection seam |
| Webhook enqueueing already exists | `src/webhooks/enqueue.ts:8` — `enqueueWebhook` |
| The store functions are the only key readers/writers | `grep -rn "getIdempotencyKey\|saveIdempotencyKey" src/` — hits only in `src/store/idempotency.ts` and `src/billing/charge.ts` |
