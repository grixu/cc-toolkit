# Webhook delivery hardening — SPEC

**What changes:** charge processing becomes durably idempotent, `charge.settled` webhook delivery
gains outcome metrics, and delivery concurrency is raised once the platform egress ceiling allows.

- Ticket: PAY-231
- Status: ready for validation
- Date: 2026-07-25

This spec supersedes nothing; there are no companion documents.

## 2. Problem and goal

Idempotency keys live in process memory (`src/store/idempotency.ts:3`), so a restart forgets every
processed order and a redelivered request charges the card twice. Webhook delivery retries exist
(`src/queue/worker.ts:3`) but nothing records delivery outcomes, and the worker delivers one event
at a time, so a burst of charges backs the queue up for minutes.

Goal: a redelivered charge request never charges twice across restarts, every webhook delivery
outcome is observable, and a burst drains in seconds rather than minutes.

## 3. Design decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Charge processing stays idempotent per `orderId`** | The lookup-before-charge shape already exists (`src/billing/charge.ts:16`); this spec only makes the store durable. Cost accepted: one storage dependency where today there is none. |
| D2 | **Idempotency keys are stored in Postgres** | The service already holds a `DATABASE_URL` and the orders schema lives there; Redis would add a second stateful dependency for the same guarantee. Cost accepted: key reads join the existing database's load. |
| D3 | **Delivery retries stay capped at 5 attempts** | The cap already exists (`src/queue/worker.ts:3`) and no incident has needed more. Raising it would only delay surfacing a dead merchant endpoint. |
| D4 | **Delivery concurrency rises to 8 workers in phase 2, behind a config flag** | One-at-a-time delivery is the queue-depth bottleneck; 8 is the largest value that stays safely under the lowest egress ceiling anyone has quoted, pending confirmation (see the declared gap in section 4). Cost accepted: merchant endpoints may see up to 8 concurrent deliveries. |

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
- Limits: keys expire after 30 days via a `created_at` index and a daily delete job.

### OBSERVABILITY-1 — delivery metrics

Counter `webhook_delivery_attempts_total{outcome}` and gauge `webhook_delivery_queue_depth`,
emitted by the worker (`src/queue/worker.ts:5`) after each attempt and each queue poll.

- Fields: the two metric names and the `outcome` label (`delivered` / `failed`).
- Errors: metric emission is best-effort; a failed emission is dropped silently.
- Auth: none — metrics are scraped from the existing endpoint.
- Limits: label cardinality is 2.

### CONFIG-1 — delivery concurrency flag

New config value `DELIVERY_CONCURRENCY`, default `1`, read by the worker at startup.

- Fields: one integer environment variable; `1` preserves today's behaviour.
- Errors: a non-integer value fails startup with a named error, never a silent fallback.
- Auth: none — deploy-manifest configuration.
- Limits: phase 2 sets it to `8`; values above `8` are rejected until the egress ceiling is
  confirmed.

### Declared gap

**The platform egress rate-limit ceiling is unconfirmed.** The value `8` in D4 and CONFIG-1 rests
on the lowest quoted ceiling, not on a confirmed number — owner: platform team, placement: gate
before phase 2 (phase 2 does not start until the platform team confirms the ceiling).

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
3. **CONFIG-1** — new: read `DELIVERY_CONCURRENCY` at worker startup and fan deliveries out across
   that many concurrent senders; default `1` keeps today's one-at-a-time behaviour.

## 7. Rollout

| # | Phase | Where | Switches anything? |
|---|---|---|---|
| 1 | DB-1, OBSERVABILITY-1 and CONFIG-1 land and deploy, `DELIVERY_CONCURRENCY=1` | payments-service | yes — the store becomes durable and metrics appear; delivery behaviour is unchanged |
| 2 | Set `DELIVERY_CONCURRENCY=8` in the deploy manifest | payments-service | yes — deliveries fan out to 8 concurrent senders |

Single environment; each phase is one deploy. Phase 2 follows phase 1 after at least three days of
clean `webhook_delivery_attempts_total` readings — long enough to cover a weekly traffic peak.

Hard dependency: **the platform team's confirmation of the egress rate-limit ceiling gates phase
2** (the declared gap in section 4). The gate is a confirmation, not a merge or a deploy.

Rollback: phase 1 — revert the merge commit and redeploy; the `idempotency_keys` table stays
behind, unused. Phase 2 — set `DELIVERY_CONCURRENCY=1` and redeploy; the reversal is complete when
the queue-depth gauge returns to its phase-1 profile.

## 8. Verification

- **DB-1** — probe: `psql "$DATABASE_URL" -c "\d idempotency_keys"` lists the four columns. Before
  the change the same command errors with `did not find any relation`.
- **OBSERVABILITY-1** — probe: `curl -s localhost:3000/metrics | grep webhook_delivery` shows both
  metrics. Before the change the grep is empty.
- **CONFIG-1** — triggered: start the worker with `DELIVERY_CONCURRENCY=abc`; startup fails with
  the named error. Start with `8`; the log line `delivery concurrency: 8` appears.

Phase 1 is verified by the DB-1 and OBSERVABILITY-1 probes plus the CONFIG-1 startup checks; phase
2 by the queue-depth gauge draining a synthetic 100-event burst in under 15 seconds.

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
| The worker delivers one event at a time today | `src/queue/worker.ts:6` — a single sequential retry loop, no concurrency primitive in the file |
| The egress rate-limit ceiling supports concurrency 8 | Unconfirmed — no documentation states the ceiling; treated as a declared gap, owner: platform team, placement: gate before phase 2 |
