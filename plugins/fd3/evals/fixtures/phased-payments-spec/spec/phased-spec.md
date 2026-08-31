# Webhook delivery hardening — SPEC

**What changes:** charge processing becomes durably idempotent, `charge.settled` webhook delivery
gains outcome metrics, and the delivery attempt rate gains a configurable cap that is raised once
the platform egress ceiling allows.

- Ticket: PAY-231
- Status: ready for validation
- Date: 2026-07-25

This spec supersedes nothing; there are no companion documents.

## 2. Problem and goal

Idempotency keys live in process memory (`src/store/idempotency.ts:3`), so a restart forgets every
processed order and a redelivered request charges the card twice. Webhook delivery retries exist
(`src/queue/worker.ts:3`) but nothing records delivery outcomes, so a failed delivery is invisible.
The retry loop also issues its attempts back to back with no delay (`src/queue/worker.ts:6`), so a
burst of charges leaves the service with no ceiling on the attempts it sends.

Goal: a redelivered charge request never charges twice across restarts, every webhook delivery
outcome is observable, and the attempt rate stays under a ceiling that can be raised without a code
change.

## 3. Design decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Charge processing stays idempotent per `orderId`** | The lookup-before-charge shape already exists (`src/billing/charge.ts:16`); this spec only makes the store durable. Cost accepted: one storage dependency where today there is none. |
| D2 | **Idempotency keys are stored in Postgres** | The service already holds a `DATABASE_URL` and the orders schema lives there; Redis would add a second stateful dependency for the same guarantee. Cost accepted: key reads join the existing database's load. |
| D3 | **Delivery retries stay capped at 5 attempts** | The cap already exists (`src/queue/worker.ts:3`) and no incident has needed more. Raising it would only delay surfacing a dead merchant endpoint. |
| D4 | **Webhook processing stays queued, off the request path** | The queue worker already owns delivery (`src/queue/worker.ts:6`); moving it into the request path would put merchant endpoint latency on the charge response. Cost accepted: the merchant learns the outcome asynchronously. |
| D5 | **The attempt rate is capped by one config value, raised in phase 2** | The retry loop applies no delay between attempts (`src/queue/worker.ts:6`), so the ceiling has to come from somewhere; a config value moves it without a deploy of new code. `8` per second is the largest value that stays safely under the lowest egress ceiling anyone has quoted, pending confirmation (the declared gap in section 4). Cost accepted: at the phase-1 value of `1` a burst drains more slowly than it does today. |

**Risks accepted**

| Risk | What it costs if it lands | Mitigation |
|---|---|---|
| `idempotency_keys` grows without bound — nothing in this spec deletes rows, and section 9 adds no cleanup. | Table size grows with order volume, and index maintenance cost rises with it. | One row per order and the primary key as the only index; a retention policy is a later change, not a blocker for this spec. |
| A provider charge that succeeds and whose key write then fails leaves the card charged with no key stored, so a redelivery charges twice. D1 keeps the existing lookup-before-charge order (`src/billing/charge.ts:16`). | One duplicate charge per occurrence, refunded by hand. | The write is retried once and the failure is surfaced as HTTP 500 rather than swallowed, so the window is visible when it opens. Closing it entirely needs reserve-before-charge, which this spec does not do. |
| Phase 1 caps the attempt rate at `1` per second, below what the service issues today, and phase 2 cannot start until the platform team confirms the ceiling (the declared gap in section 4). | A burst of charges takes longer to deliver for as long as phase 1 lasts; merchants learn outcomes later. | Retries stay capped at 5 attempts (D3), so a slow burst still terminates; the counter from OBSERVABILITY-1 shows the backlog while it lasts, and phase 2 raises the cap as soon as the confirmation lands. |

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

Counter `webhook_delivery_attempts_total{outcome}`, emitted by the worker
(`src/queue/worker.ts:5`) after each delivery attempt.

- Fields: the metric name and the `outcome` label (`delivered` / `failed`).
- Errors: metric emission is best-effort; a failed emission is dropped silently.
- Auth: none — metrics are scraped from the existing endpoint.
- Limits: label cardinality is 2.

### CONFIG-1 — delivery attempt rate cap

New config value `DELIVERY_RATE_LIMIT`: the maximum delivery attempts per second the retry loop
issues. Read from `process.env` by `deliver` (`src/queue/worker.ts:5`) on its first call and held
for the life of the process; the loop (`src/queue/worker.ts:6`) waits between attempts so the rate
is never exceeded.

- Fields: one integer environment variable, attempts per second. Default `1`, the phase-1 value.
- Errors: a value that is not a positive integer throws a named error on that first call, never a
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
2. **OBSERVABILITY-1** — new: counter emission inside the retry loop
   (`src/queue/worker.ts:6`), once per attempt.
3. **CONFIG-1** — new: read `DELIVERY_RATE_LIMIT` in `deliver` (`src/queue/worker.ts:5`) and space
   that same loop's attempts to the configured rate.

The three are independent — none reads anything another introduces — so they may land in any
order within the phase.

## 7. Rollout

| # | Phase | Where | Switches anything? | Gate after? |
|---|---|---|---|---|
| 1 | All three work items land and deploy together, `DELIVERY_RATE_LIMIT=1` | payments-service | yes — the store becomes durable, metrics appear, and the attempt rate is capped at 1 per second | yes — phase 2 waits on the platform team's ceiling confirmation, so phase 1 closes its landing unit: one branch, one pull request |
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
- **OBSERVABILITY-1** — probe: `curl -s localhost:3000/metrics | grep webhook_delivery` shows the
  counter under both `outcome` labels. Before the change the grep is empty.
- **CONFIG-1** — triggered, through `npm test` (`vitest run`, the only script `package.json`
  defines): with `DELIVERY_RATE_LIMIT=abc` the first `deliver` call throws the named error; with
  `DELIVERY_RATE_LIMIT=1` against an endpoint that always fails, the five attempts take at least
  four seconds. Before the change both are instant and neither reads the variable.

Phase 1 is verified when the two probes and the CONFIG-1 checks above pass; phase 2 by
`webhook_delivery_attempts_total` climbing at up to 8 per second under a synthetic 100-event burst,
where phase 1 held it at 1.

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
| The retry loop applies no delay between attempts | `src/queue/worker.ts:6` — the `for` loop awaits `post` and retries immediately; no timer and no backoff in the file |
| Webhook enqueueing already exists | `src/webhooks/enqueue.ts:8` — `enqueueWebhook` |
| The store functions are the only key readers/writers | `grep -rn "getIdempotencyKey\|saveIdempotencyKey" src/` — hits only in `src/store/idempotency.ts` and `src/billing/charge.ts` |
| The egress rate-limit ceiling supports 8 attempts per second | Unconfirmed — no documentation states the ceiling; treated as a declared gap, owner: platform team, placement: gate before phase 2 |
