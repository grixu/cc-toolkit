# Asynchronous settlement with a merchant-visible ledger — SPEC

**What changes:** checkout emits settlement events into a new ledger table, the ledger service
exposes them, and the merchant dashboard shows payment status — built dark in phase 1, switched on
in phase 2.

- Epic: LED-100
- Status: validated
- Date: 2026-07-28

This spec supersedes nothing; there are no companion documents.

## 2. Problem and goal

Settlement today is implicit: checkout accepts a charge (`repo-a/services/checkout/src/api/charge.ts:6`)
and nothing records the resulting ledger movement, so merchants cannot see payment status anywhere.
The ledger service has an entries endpoint stub that returns nothing
(`repo-a/services/ledger/src/api/entries.ts:7`), and the dashboard has an unrouted placeholder
component (`repo-b/src/components/PaymentStatus.tsx:5`).

Goal: every accepted charge produces a ledger entry a merchant can see in the dashboard, switched
on per the rollout, with no behaviour change until phase 2.

## 3. Design decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Ledger entries live in a new `ledger_entries` table owned by the ledger service** | The ledger service already owns the read path (`repo-a/services/ledger/src/api/entries.ts:7`); giving checkout its own copy would fork the source of truth. Cost accepted: checkout depends on the ledger schema landing first. |
| D2 | **Checkout emits settlement writes synchronously behind the `asyncSettlement` flag, default off** | The flag exists (`repo-a/services/checkout/src/config.ts:2`) and default-off keeps phase 1 dark; a queue would add a broker no current volume justifies. Cost accepted: a ledger write failure surfaces on the charge path once the flag is on. |
| D3 | **The dashboard reads through the ledger's `GET /ledger/entries` endpoint, never the database** | The dashboard is in another repository and team-web owns no database credentials; the endpoint is the contract. Cost accepted: a second network hop for status data. |
| D4 | **Phase 1 builds everything dark; phase 2 switches behaviour** | Both repositories can land and deploy independently with no user-visible change, then the switch is two small, reversible changes. Cost accepted: two deploys instead of one. |

## 4. Target architecture

### DB-1 — `ledger_entries` table (migration)

New migration `repo-a/services/ledger/migrations/0001_create_ledger_entries.sql`:

- Columns: `id BIGSERIAL PRIMARY KEY`, `order_id TEXT NOT NULL`,
  `amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0)`,
  `direction TEXT NOT NULL CHECK (direction IN ('debit','credit'))`,
  `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- Index on `(order_id, created_at)`.
- Errors: none at runtime — this element is schema only.
- Auth: applied by CI with the migration role (see the migrations README convention).
- Limits: expand-only; no column drops or renames in this spec.
- Migrations are applied by CI in filename order and are irreversible once applied to the shared
  staging database, so this element must land on `main` before any code that writes to it.

### API-2 — ledger entries endpoint (ledger service)

`GET /ledger/entries?orderId=` replaces the stub at `repo-a/services/ledger/src/api/entries.ts:7`.

- Request: `orderId` query parameter, required, non-empty string.
- Response: JSON array of `{ orderId: string, amountMinor: number, direction: "debit" | "credit", createdAt: string }`.
- Errors: 400 on a missing or empty `orderId`; 200 with `[]` when no entries exist.
- Auth: the existing internal service token middleware; the dashboard's token is already accepted.
- Limits: response capped at 500 entries, newest first.

### API-1 — settlement write from checkout

`postCharge` (`repo-a/services/checkout/src/api/charge.ts:6`) gains a settlement write: when
`flags.asyncSettlement` is true, an accepted charge writes one `credit` entry via the ledger
service's internal write endpoint.

- Fields: `orderId`, `amountMinor` from the charge body; `direction` fixed to `credit`.
- Errors: a ledger write failure fails the charge with HTTP 502 (flag on); flag off, no write
  happens and behaviour is byte-identical to today.
- Auth: the existing internal service token.
- Limits: one entry per accepted charge; no retries — the caller may retry the charge.

### UI-1 — payment status panel (dashboard)

`PaymentStatus` (`repo-b/src/components/PaymentStatus.tsx:5`) renders the entries for an order.

- Fields: renders `amountMinor`, `direction`, `createdAt` per entry; empty state for `[]`.
- Errors: an API error renders the existing dashboard error banner.
- Auth: the dashboard's existing session; the panel adds no new auth surface.
- Limits: phase 1 renders from a local mock module only and stays unrouted — dark by D4.

### CONFIG-1 — the settlement switch (checkout)

`flags.asyncSettlement` (`repo-a/services/checkout/src/config.ts:2`) flips to `true`.

- Fields: one boolean flag.
- Errors: none — the flag is read at module load.
- Auth: none — a code change through the normal review path.
- Limits: phase 2 only, after DB-1, API-1 and API-2 are deployed.

### INTEGRATION-1 — dashboard wired to the live endpoint (dashboard)

The panel swaps its mock module for the live `GET /ledger/entries` call and gets routed into the
order detail page.

- Fields: same rendering contract as UI-1; the data source changes.
- Errors: same error banner path as UI-1.
- Auth: the dashboard's existing internal service token toward the ledger.
- Limits: phase 2 only, after API-2 is deployed and UI-1 has landed.

### Prerequisites

| Prerequisite | Status |
|---|---|
| CI applies ledger migrations on merge | met — the convention is documented in `repo-a/services/ledger/migrations/README.md` and CI already runs it for the existing schema |
| Internal service token shared between the three services | met — checkout and the dashboard already call the ledger with it today |

## 5. Ownership

| Repository / component | Owns | Apply mechanism |
|---|---|---|
| repo-a `services/checkout/` | API-1, CONFIG-1 | pull request; CODEOWNERS requires team-checkout approval; CI deploys on merge |
| repo-a `services/ledger/` | DB-1, API-2 | pull request; CODEOWNERS requires team-ledger approval; CI deploys on merge and applies migrations |
| repo-b | UI-1, INTEGRATION-1 | pull request; team-web approval; CI deploys on merge |

repo-a is a monorepo with per-subtree CODEOWNERS: a pull request touching both `services/checkout/`
and `services/ledger/` needs both teams' approval, so changes are scoped to one subtree per pull
request.

## 6. The change, per repository

### repo-a — `services/ledger/` (team-ledger)

1. **DB-1** — new: migration `0001_create_ledger_entries.sql` in
   `repo-a/services/ledger/migrations/`.
2. **API-2** — changed: replace the stub in `repo-a/services/ledger/src/api/entries.ts:7-10` with
   the real query and the 400 guard.

### repo-a — `services/checkout/` (team-checkout)

3. **API-1** — changed: settlement write in `repo-a/services/checkout/src/api/charge.ts:6-8`,
   guarded by the flag.
4. **CONFIG-1** — changed: flip `asyncSettlement` to `true` in
   `repo-a/services/checkout/src/config.ts:2`.

### repo-b (team-web)

5. **UI-1** — changed: real rendering plus a mock data module, component stays unrouted
   (`repo-b/src/components/PaymentStatus.tsx:5-8`).
6. **INTEGRATION-1** — changed: swap the mock for the live endpoint call and route the panel into
   the order detail page.

## 7. Rollout

| # | Phase | Where | Switches anything? |
|---|---|---|---|
| 1 | DB-1, API-2, API-1 (flag off), UI-1 (unrouted) land and deploy | repo-a, repo-b | no — everything is dark |
| 2 | CONFIG-1 flips the flag; INTEGRATION-1 routes the panel onto live data | repo-a, repo-b | yes — settlement writes begin and merchants see status |

Build order within phase 1: DB-1 first (the migration must be applied before any writer or reader
ships), then API-2, then API-1; UI-1 is independent of all three. Phase 2 starts only after every
phase-1 item is deployed; within phase 2, CONFIG-1 and INTEGRATION-1 are independent of each
other.

Single environment per repository; each phase is one deploy per repository, checkout after ledger.
Waiting period between phases: none — phase 2 starts as soon as every phase-1 item is deployed and
its verification rows pass. Phase 1 switches nothing, so there is nothing to observe between the
phases and no gate outside this spec's own verification.

Hard dependencies: none outside this spec.

Rollback: phase 2 — flip the flag back and un-route the panel; the reversal is complete when no
new `ledger_entries` rows appear and the panel is unreachable. Phase 1 — revert the code merges;
the migration stays behind, unused (expand-only; removal is out of scope, LED-109).

## 8. Verification

- **DB-1** — probe: `psql "$LEDGER_DATABASE_URL" -c "\d ledger_entries"` lists the five columns
  and the `(order_id, created_at)` index. Before the change: `did not find any relation`.
- **API-2** — probe: `curl -s "ledger.internal/ledger/entries?orderId=o_1"` returns `[]` with 200;
  omitting `orderId` returns 400. Before the change both return the stub's empty 200.
- **API-1** — triggered: with the flag on in a test environment, post a charge; one `credit` row
  for the order appears in `ledger_entries`.
- **UI-1** — triggered: render the panel in the dashboard's component preview against the mock
  module; entries and the empty state both render.
- **CONFIG-1** — probe: `rg "asyncSettlement" repo-a/services/checkout/src/config.ts` shows
  `true`. Before phase 2 it shows `false`.
- **INTEGRATION-1** — triggered: open an order with entries in the dashboard; the panel shows the
  rows returned by API-2.

Phase 1 is verified by the DB-1, API-2 probes plus the API-1 and UI-1 triggered checks; phase 2 by
the CONFIG-1 probe and the INTEGRATION-1 triggered check.

## 9. Cleanup

The subject has no cleanup in this spec: the migration is expand-only, and removing the mock data
module happens inside INTEGRATION-1's pull request.

## 10. Out of scope

- **Refunds in the ledger (a `refund` direction)** — owner: team-ledger, placement: ticket LED-108.
- **Dropping the mock-era fixtures from the dashboard test suite** — owner: team-web, placement:
  ticket LED-109.

## 11. Tickets

LED-100 (epic), LED-108 and LED-109 exist in the tracker. No new tickets are needed; each task's
pull request cites LED-100.

## 12. Appendix — the evidence record

| Claim | How it was verified |
|---|---|
| Checkout accepts charges with no settlement record | `repo-a/services/checkout/src/api/charge.ts:6-8` — `postCharge` returns `accepted`, no write |
| The ledger entries endpoint is a stub | `repo-a/services/ledger/src/api/entries.ts:7-10` — `listEntries` returns `[]` unconditionally |
| The settlement flag exists and is off | `repo-a/services/checkout/src/config.ts:2` — `asyncSettlement: false` |
| The dashboard panel exists and is unrouted | `repo-b/src/components/PaymentStatus.tsx:5` — component returns `null`; no route references it |
| Migrations are applied by CI in filename order and are irreversible on staging | `repo-a/services/ledger/migrations/README.md` — the convention paragraph |

### Validation pass — 2026-07-30

Verdict: ready — claims: 1 verified / 0 deferred / 0 blocked — spec 216 lines at this verdict

| Claim | How it was verified |
|---|---|
| All 12 spec-level checks pass | `fd3:validate-spec` run of 2026-07-30 — every check row `pass`, no blocking findings |
| Verdict | phase 1: yes; phase 2: yes — spec is ready to split |
