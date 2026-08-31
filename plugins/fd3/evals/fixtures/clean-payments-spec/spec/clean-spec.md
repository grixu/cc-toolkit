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
| D2 | **Idempotency keys are stored in Postgres** | The service already holds a `DATABASE_URL` and the orders schema lives there; Redis would add a second stateful dependency for the same guarantee. Cost accepted: key reads join the existing database's load. |
| D3 | **Delivery retries stay capped at 5 attempts** | The cap already exists (`src/queue/worker.ts:3`) and no incident has needed more. Raising it would only delay surfacing a dead merchant endpoint. |
| D4 | **Webhook processing stays queued, off the request path** | The queue worker already owns delivery (`src/queue/worker.ts:6`); moving it into the request path would put merchant endpoint latency on the charge response. Cost accepted: the merchant learns the outcome asynchronously. |

**Risks accepted**

| Risk | What it costs if it lands | Mitigation |
|---|---|---|
| `idempotency_keys` grows without bound — nothing in this spec deletes rows, and section 9 adds no cleanup. | Table size grows with order volume, and index maintenance cost rises with it. | One row per order and the primary key as the only index; a retention policy is a later change, not a blocker for this spec. |
| A provider charge that succeeds and whose key write then fails leaves the card charged with no key stored, so a redelivery charges twice. D1 keeps the existing lookup-before-charge order (`src/billing/charge.ts:16`). | One duplicate charge per occurrence, refunded by hand. | The write is retried once and the failure is surfaced as HTTP 500 rather than swallowed, so the window is visible when it opens. Closing it entirely needs reserve-before-charge, which this spec does not do. |

## 4. Target architecture

### DB-1 — durable idempotency key store

Replaces the in-memory `Map` in `src/store/idempotency.ts`. Contract:

- Table `idempotency_keys` with columns `order_id TEXT PRIMARY KEY`, `charge_id TEXT NOT NULL`,
  `status TEXT NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- Reads and writes go through the existing `getIdempotencyKey` / `saveIdempotencyKey` functions;
  their signatures do not change.
- Errors: a store read failure fails the charge request with HTTP 503; a write failure after a
  successful provider charge is retried once, then logged and surfaced as HTTP 500.
- Auth: the service's existing database credentials; no new principal.
- Limits: none beyond the primary key. Rows accumulate; nothing in this spec deletes them.

### OBSERVABILITY-1 — delivery metrics

Counter `webhook_delivery_attempts_total{outcome}` and gauge `webhook_delivery_queue_depth`,
emitted by the worker (`src/queue/worker.ts:5`) after each attempt and each queue poll.

- Fields: the two metric names and the `outcome` label (`delivered` / `failed`).
- Errors: metric emission is best-effort; a failed emission is dropped silently.
- Auth: none — metrics are scraped from the existing endpoint.
- Limits: label cardinality is 2.

### Prerequisites

| Prerequisite | Status |
|---|---|
| Postgres reachable from the service | met — the service already holds a `DATABASE_URL` in its deploy manifest, and the orders schema lives there |
| Metrics endpoint scraped | met — the existing `/metrics` endpoint is already scraped in every environment |

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
2. **OBSERVABILITY-1** — new: metric emission inside the retry loop (`src/queue/worker.ts:6`) and
   after each queue poll.

## 7. Rollout

| # | Phase | Where | Switches anything? |
|---|---|---|---|
| 1 | Both work items land and deploy together | payments-service | yes — the store becomes durable and metrics appear |

Single environment; the deploy on merge is the rollout. No waiting period: the change is exercised
by the next charge request.

Hard dependencies: none — everything this spec needs exists already (section 4 prerequisites).

Rollback: revert the merge commit and redeploy. The `idempotency_keys` table stays behind, unused;
dropping it is cleanup (section 9), not rollback.

## 8. Verification

- **DB-1** — probe: `psql "$DATABASE_URL" -c "\d idempotency_keys"` lists the four columns. Before
  the change the same command errors with `did not find any relation`.
- **OBSERVABILITY-1** — probe: `curl -s localhost:3000/metrics | grep webhook_delivery` shows both
  metrics. Before the change the grep is empty.

Phase 1 is verified when both checks above pass.

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
| Webhook enqueueing already exists | `src/webhooks/enqueue.ts:8` — `enqueueWebhook` |
| The store functions are the only key readers/writers | `grep -rn "getIdempotencyKey\|saveIdempotencyKey" src/` — hits only in `src/store/idempotency.ts` and `src/billing/charge.ts` |
