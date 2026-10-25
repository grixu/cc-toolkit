# Asynchronous settlement with a merchant-visible ledger — SPEC

**What changes:** checkout emits settlement events into a new ledger table, the ledger service
exposes them, and the merchant dashboard shows payment status — built dark in phase 1, switched on
in phase 2.

- Epic: LED-100
- Status: ready — validated 2026-10-25 (post-verdict re-entry, pass 3)
- Date: 2026-07-28

This spec supersedes nothing. Companion document: [rollout-spec.notes.md](rollout-spec.notes.md) — the closing notes; its section 5 holds the decisions taken after the 2026-07-30 verdict.

## 2. Problem and goal

Settlement today is implicit: checkout accepts a charge (`repo-a/services/checkout/src/api/charge.ts:6`)
and nothing records the resulting ledger movement, so merchants cannot see payment status anywhere.
The ledger service has an entries endpoint stub that returns nothing
(`repo-a/services/ledger/src/api/entries.ts:7`), and the dashboard has an unrouted placeholder
component (`repo-b/src/components/PaymentStatus.tsx:5`).

Goal: every accepted charge produces a ledger entry a merchant can see in the dashboard — written
on the charge path, or backfilled by hand where that write failed (D2) — switched on per the
rollout, with no behaviour change until phase 2.

## 3. Design decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Ledger entries live in a new `ledger_entries` table owned by the ledger service** | Q1 a. The ledger service already owns the read path (`repo-a/services/ledger/src/api/entries.ts:7`); giving checkout its own copy would fork the source of truth. Cost accepted: checkout depends on the ledger schema landing first. |
| D2 | **Checkout emits settlement writes synchronously behind the `asyncSettlement` flag, default off; a failed write is logged with the order id and the charge still returns `accepted`** | Q2 b, chosen on post-verdict re-entry 2026-10-25, superseding the user's Q2 a (a failed write fails the charge with 502) because the user chose that a ledger failure must not fail the charge; the flag exists (`repo-a/services/checkout/src/config.ts:2`), default-off keeps phase 1 dark, and the queue (Q2 c) stays declined. Cost accepted: with the flag on, an accepted charge can lack its ledger entry, and its merchant sees incomplete status, until the entry is backfilled by hand from the log line. Backfill: owner team-checkout, placement a ticket still to be opened under LED-100 that gates phase 2; per settlement-failure line, `GET /ledger/entries?orderId=` first, then `POST` one `credit` entry only when none exists. |
| D3 | **The dashboard reads through the ledger's `GET /ledger/entries` endpoint, never the database** | Q3 a. The dashboard is in another repository and team-web owns no database credentials; the endpoint is the contract. Cost accepted: a second network hop for status data. |
| D4 | **Phase 1 builds everything dark; phase 2 switches behaviour** | Q4 a. Both repositories can land and deploy independently with no user-visible change, then the switch is two small, reversible changes. Cost accepted: two deploys instead of one. |
| D5 | **The settlement-failure log line carries `orderId` and `amountMinor`** | User-ratified on post-verdict re-entry 2026-10-25, answering write-spec's question 1, and following from Q2 b: the backfill reads the entry from that line, and checkout persists nothing else holding the amount (`repo-a/services/checkout/src/api/charge.ts:1-8`); `direction` is always `credit` (API-1). Cost accepted: the charge amount appears in checkout's logs. |

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

### API-2 — ledger entries endpoints (ledger service)

`GET /ledger/entries?orderId=` replaces the stub at `repo-a/services/ledger/src/api/entries.ts:7`, and `POST /ledger/entries` is added beside it.

- Request: `GET` takes an `orderId` query parameter, required, non-empty string; `POST` takes a JSON body `{ orderId: string, amountMinor: number, direction: "debit" | "credit" }`.
- Response: `GET` returns a JSON array of `{ orderId: string, amountMinor: number, direction: "debit" | "credit", createdAt: string }`; `POST` returns 201 with the stored entry.
- Errors: 400 on a missing or empty `orderId` (both methods) or a negative `amountMinor`; `GET` returns 200 with `[]` when no entries exist.
- Auth: the existing internal service token middleware; the dashboard's token is already accepted.
- Limits: `GET` responses capped at 500 entries, newest first; `POST` writes exactly one row.

### API-1 — settlement write from checkout

`postCharge` (`repo-a/services/checkout/src/api/charge.ts:6`) gains a settlement write: when
`flags.asyncSettlement` is true, an accepted charge writes one `credit` entry through API-2's
`POST /ledger/entries`.

- Fields: `orderId`, `amountMinor` from the charge body; `direction` fixed to `credit`.
- Errors: flag on, a ledger write failure is logged as one line carrying `orderId` and
  `amountMinor` (D5) and the charge still returns `accepted`; flag off, no write happens and
  behaviour is byte-identical to today.
- Auth: the existing internal service token.
- Limits: at most one entry per accepted charge; no retries — a failed write is recovered only by
  the hand backfill from its log line (D2).

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
| CI applies ledger migrations on merge | met — the convention is documented in `repo-a/services/ledger/migrations/README.md`; no migration has run under it yet (the directory holds no SQL file and DB-1 is `0001`) |
| Internal service token shared between the three services | met — checkout and repo-b both hold it for the ledger, configured in each service's deploy secrets (user-confirmed 2026-10-25) |

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
   the real query and the 400 guard, and add the `POST` handler beside it.

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
phase-1 item is deployed and the D2 backfill ticket is open under LED-100; within phase 2, CONFIG-1 and INTEGRATION-1 are independent of each
other.

Single environment per repository; each work item lands as one pull request that CI deploys on merge, so phase 1 is
three deploys in repo-a (DB-1, then API-2, then API-1 — ledger before checkout) and one in repo-b (UI-1), and phase 2 is one per repository.
Waiting period between phases: none — phase 2 starts as soon as every phase-1 item is deployed,
its verification rows pass and the D2 backfill ticket is open. Phase 1 switches nothing, so there is nothing to observe between the
phases and no gate outside this spec's own verification and the D2 backfill ticket.

Hard dependencies: none outside this spec.

Rollback: phase 2 — flip the flag back and un-route the panel; the reversal is complete when no
new `ledger_entries` rows appear and the panel is unreachable. Phase 1 — revert the code merges;
the migration stays behind, unused (expand-only; removal is out of scope, LED-109).

## 8. Verification

- **DB-1** — probe: `psql "$LEDGER_DATABASE_URL" -c "\d ledger_entries"` lists the five columns
  and the `(order_id, created_at)` index. Before the change: `did not find any relation`.
- **API-2** — probe: `curl -s "ledger.internal/ledger/entries?orderId=o_1"` returns `[]` with 200;
  omitting `orderId` returns 400; a valid `POST` returns 201. Before the change both `GET`s return the stub's empty 200 and the `POST` 404s.
- **API-1** — triggered: with the flag on in a test environment, post a charge; one `credit` row
  for the order appears in `ledger_entries`. Then, with the ledger unreachable, post a charge: it
  returns `accepted`, no row appears, and checkout logs one line carrying its `orderId` and
  `amountMinor` (before the change: no line, no row, `accepted`).
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

LED-100 (epic), LED-108 and LED-109 exist in the tracker. One new ticket is needed: the D2 backfill ticket under LED-100,
owner team-checkout, opened before phase 2 starts. Each task's pull request cites LED-100.

## 12. Appendix — the evidence record

| Claim | How it was verified |
|---|---|
| Checkout accepts charges with no settlement record | `repo-a/services/checkout/src/api/charge.ts:6-8` — `postCharge` returns `accepted`, no write |
| The ledger entries endpoint is a stub | `repo-a/services/ledger/src/api/entries.ts:7-10` — `listEntries` returns `[]` unconditionally |
| D2 is Q2 b, ratified post-verdict and superseding Q2 a | `rollout-spec.notes.md` section 5, decision 1 — dated 2026-10-25, with the user's words |
| D5 is user-ratified, no longer assistant-taken | `rollout-spec.notes.md` section 5, decision 2 — dated 2026-10-25, answering write-spec's question 1 |
| Checkout holds `amountMinor` only in the charge request body and persists nothing | `repo-a/services/checkout/src/api/charge.ts:1-8` — `ChargeBody` carries it; `postCharge` writes nowhere |
| The settlement flag exists and is off | `repo-a/services/checkout/src/config.ts:2` — `asyncSettlement: false` |
| The dashboard panel exists and is unrouted | `repo-b/src/components/PaymentStatus.tsx:5` — component returns `null`; no route references it |
| Migrations are applied by CI in filename order and are irreversible on staging | `repo-a/services/ledger/migrations/README.md` — the convention paragraph |

### Validation pass — 2026-07-30

Verdict: ready — claims: 1 verified / 0 deferred / 0 blocked — spec 216 lines at this verdict

| Claim | How it was verified |
|---|---|
| All 12 spec-level checks pass | `fd3:validate-spec` run of 2026-07-30 — every check row `pass`, no blocking findings |
| Verdict | phase 1: yes; phase 2: yes — spec is ready to split |

### Validation pass — 2026-10-25 (post-verdict re-entry, pass 1)

Verdict: not ready — claims: 9 verified / 0 deferred / 0 blocked / 2 open (handed up) — spec 248 lines at this verdict
Checked at: repo-a (commerce-core, no remote) @ 46f5535, repo-b (merchant-dashboard, no remote) @ 3629a60

| Claim | How it was verified |
|---|---|
| Every `path:line` in the spec resolves | Scripted read of `charge.ts:1-8`, `:6`, `:6-8`; `entries.ts:7`, `:7-10`; `config.ts:2`; `PaymentStatus.tsx:5`, `:5-8`; migrations `README.md` — each holds what the spec says. |
| D2 is Q2 b and supersedes Q2 a and accepted risk 1 | `rollout-spec.notes.md` section 5, decision 1 — dated 2026-10-25, quotes the user. |
| D5 is user-ratified | `rollout-spec.notes.md` section 5, decision 2. |
| D1, D3, D4 open with their question numbers | `rollout-spec.notes.md` section 5, decision 3; rows read `Q1 a`, `Q3 a`, `Q4 a`. |
| The 502 path is gone everywhere D2 reaches | `grep 502` hits only D2's superseded-history clause; section 2 goal, API-1 errors and limits, and the section 8 API-1 row all state `accepted` plus the log line. |
| The D5 log line carries everything the backfill must write | API-2 `POST` body is `orderId`, `amountMinor`, `direction`; the line carries the first two and API-1 fixes `direction` to `credit`. |
| Build-order join holds | API-1 writes through API-2's `POST`, which lands before it in phase 1; DB-1 precedes both writers (API-2 `POST`, API-1); CONFIG-1 and INTEGRATION-1 wait for phase 1. |
| Landing shape per section 5 | repo-a `README.md` — one subtree per pull request, CODEOWNERS per subtree; migrations `README.md` — CI applies on merge to `main`. Neither tree holds CI configuration, so service deploy-on-merge rests on the spec's word (inference). |
| The dashboard panel is unrouted | repo-b holds no route or page file; nothing imports `PaymentStatus`. |
| OPEN — the hand backfill D2 relies on has an owner and a placement | Section 3 D2, section 2 goal: no owner, placement or write procedure is stated anywhere; handed up. Blocking for phase 2. |
| OPEN — prerequisite "checkout and the dashboard already call the ledger with the token today" | Neither tree holds a ledger caller (`postCharge` writes nowhere; `PaymentStatus` returns `null`) or token middleware; handed up as a fact. Blocking for phase 1. |
| Spec edit — section 1 header | "no companion documents" corrected: the section 12 rows now cite `rollout-spec.notes.md`. |
| Non-blocking — section 7 rollback cites LED-109 for migration removal | Section 10 places LED-109 as the team-web dashboard-fixture drop; no out-of-scope item covers migration removal. |
| Non-blocking — section 6 and section 7 landing counts | Section 6 states no per-item phase or landing; "one deploy per repository" disagrees with DB-1 merging before API-2's writer and one subtree per PR (repo-a phase 1 is three merges). Regrade: the 2026-07-30 record passed check 8. |
| Non-blocking — section 4 prerequisite 1 overclaims | "CI already runs it for the existing schema": the migrations directory holds no SQL file and DB-1 is `0001`; the convention itself is documented. |
| Resolved — the hand backfill: deferred | User answer 2026-10-25: owner team-checkout; placement a ticket still to be opened under LED-100 that gates phase 2; procedure GET-then-POST. Recorded in section 3 D2, section 7 and section 11. |
| Resolved — prerequisite 2: verified | User answer 2026-10-25: checkout and repo-b hold the internal service token for the ledger in each service's deploy secrets. Section 4 row now cites that location. |

Verdict: ready — claims: 10 verified / 1 deferred / 0 blocked — spec 252 lines at this verdict

### Validation pass — 2026-10-25 (post-verdict re-entry, pass 2)

Verdict: ready — claims: 7 verified / 1 deferred / 0 blocked — spec 271 lines at this verdict
Checked at: repo-a (commerce-core, no remote) @ 46f5535, repo-b (merchant-dashboard, no remote) @ 3629a60

| Claim | How it was verified |
|---|---|
| Every `path:line` in the spec resolves | Read every tracked file in both trees: `charge.ts:1-8`, `:6`, `:6-8`; `entries.ts:7`, `:7-10`; `config.ts:2`; `PaymentStatus.tsx:5`, `:5-8`; migrations `README.md` — each holds what the spec says. |
| Build-order join holds | DB-1 precedes both writers (API-2 `POST`, API-1); API-1 calls API-2's `POST`, which lands before it; CONFIG-1 and INTEGRATION-1 wait for phase 1. |
| Section 7 per-repository deploy count | Settled by count: one subtree per pull request (repo-a `README.md`) and DB-1 on `main` before its writers make repo-a phase 1 three merges. "One deploy per repository" corrected; closes the pass-1 non-blocking finding. |
| Phase 2 start condition agrees across section 7 | The waiting-period sentence omitted the D2 backfill ticket that the build-order paragraph and the gate sentence require; added. Non-blocking. |
| Section 4 prerequisite 1 | `ls repo-a/services/ledger/migrations` — `README.md` only; "CI already runs it for the existing schema" corrected. Closes the pass-1 non-blocking finding. |
| Landing shape per section 5 | repo-a `README.md` (one subtree per PR, CODEOWNERS per subtree), migrations `README.md` (CI applies on merge), repo-b `README.md` (team-web). No CI config in either tree: deploy-on-merge is inference on the spec's word. |
| Token accepted by all three services | Checkout and repo-b: user-confirmed 2026-10-25. Ledger side: neither tree holds a server or middleware layer at all, so API-2's "existing middleware" rests on the user's "each service's deploy secrets" (inference). |
| Deferred — the D2 hand backfill | Owner team-checkout; placement the LED-100 ticket that gates phase 2 (section 3 D2, section 7, section 11). |
| Non-blocking — section 7 rollback cites LED-109 for migration removal | Section 10 places LED-109 as the team-web fixture drop; migration removal has no owner or ticket of its own. Carried from pass 1. |
| Non-blocking — API-2 `POST` error set | Section 4 API-2 states no error for a missing `amountMinor` or `direction`, or a `direction` outside `debit`/`credit` (DB-1's CHECK would reject it). Its only callers write `credit`. |

### Validation pass — 2026-10-25 (post-verdict re-entry, pass 3)

Verdict: ready — claims: 5 verified / 1 deferred / 0 blocked — spec 287 lines at this verdict
Checked at: repo-a (commerce-core, no remote) @ 46f5535, repo-b (merchant-dashboard, no remote) @ 3629a60

| Claim | How it was verified |
|---|---|
| Every `path:line` in the spec resolves | Re-read every tracked file in both trees (7 files): `charge.ts:1-8`, `:6`, `:6-8`; `entries.ts:7`, `:7-10`; `config.ts:2`; `PaymentStatus.tsx:5`, `:5-8` — each holds what the spec says. |
| Section 4 prerequisite 1, as pass 2 rewrote it | `git ls-files` in repo-a: `services/ledger/migrations/` holds `README.md` only, so "no migration has run under it yet" and DB-1 as `0001` hold. |
| Section 7 landing and phase-2 start sentences, as pass 2 rewrote them | Re-walked the join: DB-1 lands on `main` before API-2 `POST` writes; API-1 calls API-2 `POST`; one subtree per PR (repo-a `README.md`) makes repo-a phase 1 three merges, phase 2 one per repository, and all three phase-2 start statements name the D2 backfill ticket. |
| Landing shape per section 5 | repo-a `README.md` (one subtree per PR, CODEOWNERS per subtree), migrations `README.md` (CI applies on merge to `main`), repo-b `README.md` (team-web). No CI config in either tree: service deploy-on-merge rests on the spec's word (inference). |
| Deferred — the D2 hand backfill | Owner team-checkout; placement the LED-100 ticket that gates phase 2 (section 3 D2, section 7, section 11). |
| Non-blocking — section 7 rollback cites LED-109 for migration removal | Section 10 places LED-109 as the team-web fixture drop; migration removal has no owner or ticket of its own. Carried from pass 1. |
| Non-blocking — API-2 `POST` error set | No error stated for a missing `amountMinor` or `direction`, or a `direction` outside `debit`/`credit`. Its only callers write a valid `credit` entry; carried from pass 2. |
| Non-blocking — API-1 write has no timeout | API-1's limits name no timeout for the synchronous ledger write, so a hung ledger stalls the charge that D2 says a ledger failure must not fail. New this pass; flag-off phase 1 never calls it, and section 8's API-1 row covers only an unreachable ledger. |
