# Asynchronous settlement with a merchant-visible ledger — SPEC

**What changes:** checkout emits settlement events into a new ledger table, the ledger service
exposes them, and the merchant dashboard shows payment status — built dark in phase 1, switched on
in phase 2.

- Epic: LED-100
- Status: ready — validation pass 2026-10-25
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
| D5 | **The dashboard reaches the ledger only through a server-side proxy in repo-b (API-3) that holds the service token, run as an edge/serverless function beside the static site on repo-b's host** | Chosen at the 2026-10-25 validation pass (Q1, option b): the token in `repo-b/src/api/ledger.ts:5` is a `VITE_*` variable, which Vite bundles into client code, and the ledger checks only that token. Cost accepted: a new server-side component owned by team-web. |

## 4. Target architecture

### DB-1 — `ledger_entries` table (migration)

New migration `repo-a/services/ledger/migrations/0001_create_ledger_entries.sql`:

- Columns: `id BIGSERIAL PRIMARY KEY`, `order_id TEXT NOT NULL`,
  `amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0)`,
  `direction TEXT NOT NULL CHECK (direction IN ('debit','credit'))`,
  `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- Index on `(order_id, created_at)`, and a unique index on `(order_id, direction)` so a retried
  settlement write cannot add a second row (2026-10-25 pass 2, Q1).
- Errors: none at runtime — this element is schema only.
- Auth: applied by CI with the `LEDGER_DATABASE_URL` secret (`repo-a/.github/workflows/ledger.yml:17-20`).
- Limits: expand-only; no column drops or renames in this spec.
- Migrations are applied by CI in filename order and are irreversible once applied to the shared
  staging database, so this element must land on `main` before any code that writes to it.
- CI re-runs every migration file on every merge that touches `services/ledger/` with
  `ON_ERROR_STOP=1` (`repo-a/.github/workflows/ledger.yml:16-18`), so the migration creates the
  table and both indexes with `IF NOT EXISTS`. PostgreSQL requires an index name with
  `IF NOT EXISTS`, so the indexes are `ledger_entries_order_created_idx` and
  `ledger_entries_order_direction_key`.

### API-2 — ledger entries endpoints (ledger service)

`GET /ledger/entries?orderId=` replaces the stub at `repo-a/services/ledger/src/api/entries.ts:7`, and `POST /ledger/entries` is added beside it.

- Request: `GET` takes an `orderId` query parameter, required, non-empty string; `POST` takes a JSON body `{ orderId: string, amountMinor: number, direction: "debit" | "credit" }`.
- Response: `GET` returns a JSON array of `{ orderId: string, amountMinor: number, direction: "debit" | "credit", createdAt: string }`; `POST` returns 201 with the stored entry, or 200 with the existing entry when one already exists
  for that `orderId` and `direction`.
- Errors: 400 on a missing or empty `orderId` (both methods), a missing, non-integer or negative `amountMinor`, or a
  `direction` other than `debit` or `credit`; `GET` returns 200 with `[]` when no entries exist.
- Auth: the existing internal service token middleware; the dashboard reaches it only through API-3 (D5).
- Limits: `GET` responses capped at 500 entries, newest first; `POST` writes at most one row per `orderId` and `direction`.

### API-1 — settlement write from checkout

`postCharge` (`repo-a/services/checkout/src/api/charge.ts:6`) gains a settlement write: when
`flags.asyncSettlement` is true, an accepted charge writes one `credit` entry through API-2's
`POST /ledger/entries`.

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
- Limits: phase 2 only, after DB-1, API-1 and API-2 are deployed and the section 7 token rotation is done.

### INTEGRATION-1 — dashboard wired to the live endpoint (dashboard)

The panel swaps its mock module for API-3's live `GET /api/ledger/entries` call and gets routed
into the order detail page.

- Fields: same rendering contract as UI-1; the data source changes.
- Errors: same error banner path as UI-1.
- Auth: the merchant session toward API-3; the service token stays server-side (D5).
- Limits: phase 2 only, after API-2 and API-3 are deployed and UI-1 has landed.

### API-3 — ledger proxy (dashboard)

An edge/serverless function in repo-b, deployed beside the static site on repo-b's host, forwards
to API-2 with the internal service token, read from server-side configuration; `repo-b/src/api/ledger.ts:3-11` calls it instead of the ledger and
stops reading `VITE_SERVICE_TOKEN`.

- Request: `GET /api/ledger/entries?orderId=` (required, non-empty) with the merchant session;
  `GET /api/ledger/health` with no session, forwarding `GET /ledger/health` for `ledgerReachable`.
- Response: API-2's body and status, unchanged.
- Errors: 400 on a missing or empty `orderId`; 401 with no valid merchant session; 403 when the
  session's merchant does not own the order; 502 when the ledger call fails.
- Auth: merchant session in, internal service token out; no client code holds the token.
- Limits: forwards those two routes only; phase 2 only, deployed before INTEGRATION-1.
- Declared gap: the server-verifiable merchant session, the order-to-merchant ownership source and
  the host's function layout are not yet established — owner: team-web, placement: the gate before
  work item 7 starts.

### Prerequisites

| Prerequisite | Status |
|---|---|
| CI applies ledger migrations on merge | met — `repo-a/.github/workflows/ledger.yml` applies `services/ledger/migrations/*.sql` in filename order on every merge to `main` that touches the ledger, the convention `repo-a/services/ledger/migrations/README.md` documents |
| Internal service token shared between the three services | met — the ledger's `requireServiceToken` guards its routes, and checkout (`repo-a/services/checkout/src/clients/ledger.ts`) and the dashboard (`repo-b/src/api/ledger.ts`) already send it on their `GET /ledger/health` calls |

## 5. Ownership

| Repository / component | Owns | Apply mechanism |
|---|---|---|
| repo-a `services/checkout/` | API-1, CONFIG-1 | pull request; CODEOWNERS requires team-checkout approval; CI deploys on merge |
| repo-a `services/ledger/` | DB-1, API-2 | pull request; CODEOWNERS requires team-ledger approval; CI deploys on merge and applies migrations |
| repo-b | UI-1, INTEGRATION-1, API-3 | pull request; team-web approval; CI deploys on merge |

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
   guarded by the flag, and a ledger POST helper beside `ledgerGet` in
   `repo-a/services/checkout/src/clients/ledger.ts:3-7`.
4. **CONFIG-1** — changed: flip `asyncSettlement` to `true` in
   `repo-a/services/checkout/src/config.ts:2`.

### repo-b (team-web)

5. **UI-1** — changed: real rendering plus a mock data module, component stays unrouted
   (`repo-b/src/components/PaymentStatus.tsx:5-8`).
6. **INTEGRATION-1** — changed: swap the mock for the live endpoint call and route the panel into
   the order detail page.
7. **API-3** — new: the server-side proxy route; changed: `repo-b/src/api/ledger.ts:3-11` calls it
   and drops `VITE_SERVICE_TOKEN`.

## 7. Rollout

| # | Phase | Where | Switches anything? |
|---|---|---|---|
| 1 | DB-1, API-2, API-1 (flag off), UI-1 (unrouted) land and deploy | repo-a, repo-b | no — everything is dark |
| 2 | API-3 deploys; `SERVICE_TOKEN` is rotated; CONFIG-1 flips the flag; INTEGRATION-1 routes the panel onto live data | repo-a, repo-b | yes — settlement writes begin and merchants see status |

Build order within phase 1: DB-1 first (the migration must be applied before any writer or reader
ships), then API-2, then API-1; UI-1 is independent of all three. Phase 2 starts only after every
phase-1 item is deployed; within phase 2, API-3 is deployed before INTEGRATION-1 deploys. After
API-3 deploys and before CONFIG-1 flips, team-ledger rotates `SERVICE_TOKEN` — the ledger's,
checkout's and API-3's copies in one rotation, because the ledger accepts a single token
(`repo-a/services/ledger/src/middleware/serviceToken.ts:6-7`) and checkout sends it
(`repo-a/services/checkout/src/clients/ledger.ts:5`). Risk accepted (2026-10-25 pass 2, Q2): the
three copies cannot swap at once, so checkout's readiness and API-3's `/api/ledger/health` fail
until the last copy is swapped; with the flag still off no charge calls the ledger.

Single environment per repository. Phase 1 is one deploy per service it touches, checkout after
ledger; phase 2 deploys repo-b twice — API-3, then INTEGRATION-1 — and checkout once, for CONFIG-1
after the token rotation.
Waiting period between phases: none — phase 2 starts as soon as every phase-1 item is deployed and
its verification rows pass. Phase 1 switches nothing, so there is nothing to observe between the
phases and no gate outside this spec's own verification.

Hard dependencies: none outside this spec.

Rollback: phase 2 — flip the flag back and un-route the panel; the reversal is complete when no
new `ledger_entries` rows appear and the panel is unreachable. Phase 1 — revert the code merges;
the migration stays behind, unused (expand-only; removal is out of scope, LED-109).

## 8. Verification

- **DB-1** — probe: `psql "$LEDGER_DATABASE_URL" -c "\d ledger_entries"` lists the five columns,
  the `(order_id, created_at)` index and the unique `(order_id, direction)` index. Before the change: `did not find any relation`.
- **API-2** — probe: `curl -s "ledger.internal/ledger/entries?orderId=o_1"` returns `[]` with 200;
  omitting `orderId` returns 400; a valid `POST` returns 201, and repeating it returns 200 with the same entry. Before the change both `GET`s return the stub's empty 200 and the `POST` 404s.
- **API-1** — probe, phase 1, in the deployed environment: with the flag off, post a charge; it
  returns `accepted` and no `ledger_entries` row appears for the order. Triggered, phase 2, in the
  deployed environment after CONFIG-1 deploys: post a charge; one `credit` row for the order
  appears — if not, flip the flag back (section 7 rollback).
- **UI-1** — triggered: render the panel in the dashboard's component preview against the mock
  module; entries and the empty state both render.
- **CONFIG-1** — probe: `rg "asyncSettlement" repo-a/services/checkout/src/config.ts` shows
  `true`. Before phase 2 it shows `false`.
- **API-3** — probe, phase 2, in the deployed environment: `/api/ledger/entries` returns the
  order's rows for its own merchant's session and 403 for another merchant's;
  `rg VITE_SERVICE_TOKEN repo-b/src` finds nothing. Before the change: 404, and
  `src/api/ledger.ts:5`.
- **Token rotation (phase 2 gate)** — probe, in the deployed environment, before CONFIG-1: a
  ledger request with the pre-rotation token is rejected, while checkout's readiness and
  `/api/ledger/health` still succeed. Before the rotation: the old token is accepted.
- **INTEGRATION-1** — triggered: open an order with entries in the dashboard; the panel shows the
  rows returned by API-2.

Phase 1 is verified by the DB-1, API-2 and API-1 flag-off probes plus the UI-1 triggered check;
phase 2 by the CONFIG-1, API-3 and token-rotation probes plus the API-1 flag-on and INTEGRATION-1 triggered checks.

## 9. Cleanup

The subject has no cleanup in this spec: the migration is expand-only, and removing the mock data
module happens inside INTEGRATION-1's pull request.

## 10. Out of scope

- **Refunds in the ledger (a `refund` direction)** — owner: team-ledger, placement: ticket LED-108.
- **Dropping the mock-era fixtures from the dashboard test suite, and removing the DB-1 migration
  a phase-1 rollback leaves behind** — owner: team-web, placement: ticket LED-109.

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
| Migrations are applied by CI in filename order and are irreversible on staging | `repo-a/services/ledger/migrations/README.md` — the convention paragraph; `repo-a/.github/workflows/ledger.yml:13-18` — the migration step runs every `*.sql` in glob order before the deploy step |
| Every subtree and repo-b deploy from CI on merge to `main` | `repo-a/.github/workflows/ledger.yml`, `repo-a/.github/workflows/checkout.yml` and `repo-b/.github/workflows/deploy.yml` — each a `push: main` job ending in its deploy step |
| The ledger's routes sit behind the service-token middleware; `GET /ledger/entries` serves the stub and no `POST` route exists | `repo-a/services/ledger/src/server.ts:4-7` — the route table; `repo-a/services/ledger/src/middleware/serviceToken.ts:5` — `requireServiceToken` |
| Checkout and the dashboard already call the ledger with the service token | `repo-a/services/checkout/src/clients/ledger.ts:3-7` and `repo-a/services/checkout/src/health.ts:4`; `repo-b/src/api/ledger.ts:3-11` — each sends `x-service-token` |
| The dashboard has a session, a routed order detail page, an error banner and a component preview | `repo-b/src/session.ts:5`, `repo-b/src/router.tsx:3-5`, `repo-b/src/pages/OrderDetail.tsx:1`, `repo-b/src/components/ErrorBanner.tsx:1`, `repo-b/src/preview/index.tsx:3-5` |

### Validation pass — 2026-07-30

Verdict: ready — claims: 1 verified / 0 deferred / 0 blocked — spec 220 lines at this verdict

| Claim | How it was verified |
|---|---|
| All 12 spec-level checks pass | `fd3:validate-spec` run of 2026-07-30 — every check row `pass`, no blocking findings |
| Verdict | phase 1: yes; phase 2: yes — spec is ready to split |

### Validation pass — 2026-10-25

Verdict: not ready — claims: 13 verified / 0 deferred / 0 blocked — spec 240 lines at this verdict
Checked at: repo-a @ 7dddce4, repo-b @ 1caf0fd (local `main`; neither clone has a remote, so nothing to fetch)

| Claim | How it was verified |
|---|---|
| The nine section 12 rows above (2026-07-28 record) | Every cited `path:line` re-read at the commits above; each still says what its row claims — no drift. |
| Section 2–6 citations and both section 4 prerequisites | `charge.ts:6`, `entries.ts:7`, `config.ts:2`, `PaymentStatus.tsx:5` and their ranges resolve; `ledger.yml:13-18`, `server.ts:5`, `clients/ledger.ts:5`, `health.ts:4`, `repo-b/src/api/ledger.ts:5,10` back both prerequisites. |
| DB-1 is applied by CI with the migration role, per the migrations README | Wrong citation: `services/ledger/migrations/README.md` names no role; CI applies with the `LEDGER_DATABASE_URL` secret (`repo-a/.github/workflows/ledger.yml:17-20`). Section 4 corrected. |
| Each phase is one deploy per repository | False for repo-a: `ledger.yml:6` and `checkout.yml:6` deploy per subtree, so phase 1 is two repo-a deploys. Section 7 corrected to one deploy per service touched. |
| Changes land one subtree per PR, with CODEOWNERS approval (section 5) | `repo-a/README.md:8` states both; no CODEOWNERS file exists in repo-a at 7dddce4. Open, non-blocking — the one-subtree rule binds either way. |
| The dashboard's service token reaches the ledger safely (D3, API-2, INTEGRATION-1 auth) | `repo-b/src/api/ledger.ts:5` reads `import.meta.env.VITE_SERVICE_TOKEN`, which Vite bundles into client code ("should not contain sensitive information", vite.dev/guide/env-and-mode); `serviceToken.ts:5-8` checks only that token. Open, blocking — phase 2 exposes every order's entries to any merchant browser. |
| API-1's phase 1 triggered check runs "with the flag on in a test environment" (section 8) | Section 7 states a single environment per repository and `config.ts:2` makes the flag a code constant, so no flag-on environment exists in phase 1. Open, blocking — phase 1's gate cannot pass as written. |
| Migration removal is placed at LED-109 (section 7 rollback) | Section 10 makes LED-109 the dashboard-fixtures ticket owned by team-web. Open, non-blocking — the migration-removal owner and ticket are user facts. |
| API-2 `POST` errors are complete | No error is stated for a `direction` outside `debit`/`credit`; DB-1's CHECK would reject it with no defined response. Open, non-blocking. |
| API-1 writes one entry per accepted charge | A `POST` that succeeds after its response is lost, then a caller retry, writes a second `credit`; neither API-2 nor DB-1 enforces uniqueness. Open, non-blocking. |
| Work item 3 needs only `charge.ts:6-8` | `services/checkout/src/clients/ledger.ts:3-7` exports `ledgerGet` only, so API-1 needs a POST helper that no work item lists. Open, non-blocking. |
| LED-100, LED-108, LED-109 exist (section 11) | Accepted on the spec's word; this pass had no tracker access. |

#### Answers applied — 2026-10-25

Verdict: not ready — claims: 16 verified / 0 deferred / 0 blocked — spec 278 lines at this verdict
Checked at: repo-a @ 7dddce4, repo-b @ 1caf0fd

| Claim | How it was verified |
|---|---|
| Token exposure repaired by a server-side proxy (Q1, option b) | User's answer: added D5, API-3 and work item 7, and repointed INTEGRATION-1, section 5, the section 7 phase 2 row and build order, and section 8. Closes the blocking token row above. |
| API-1's phase-1 check has a place to run (Q2) | User's answer: section 8 now probes the flag-off path in phase 1 and moves the flag-on triggered check to phase 2 after CONFIG-1. Closes the blocking check row above. |
| Migration removal is placed at LED-109 (Q3) | User's answer: LED-109 covers both; section 10's entry now names the migration half. Closes the LED-109 row above. |
| CI deploys each subtree and repo-b on merge (section 5) | Every workflow's deploy step runs `./scripts/deploy.sh` (`ledger.yml:22`, `checkout.yml:14`, `repo-b/.github/workflows/deploy.yml:13`), and neither repository contains `scripts/`. Open, non-blocking — the deploy target lives outside both trees. |
| API-3 runs somewhere repo-b deploys | repo-b holds only client code, and the Q1 answer left "backend or edge function" undecided. Open, blocking phase 2 — handed up. |
| API-3 can check that the session's merchant owns the order | `repo-b/src/session.ts:5-8` reads `merchantId` from browser `sessionStorage`, which a server cannot trust, and neither repository maps orders to merchants. Open, blocking phase 2 — handed up. |
| Removing the token from the bundle closes the exposure | The value already shipped in deployed bundles stays valid at the ledger (`serviceToken.ts:5-8`), and CONFIG-1 does not wait for API-3. Open, blocking phase 2 — handed up. |

#### Answers applied, round 3 — 2026-10-25

Verdict: ready — claims: 19 verified / 1 deferred / 0 blocked — spec 300 lines at this verdict
Checked at: repo-a @ 7dddce4, repo-b @ 1caf0fd

| Claim | How it was verified |
|---|---|
| API-3 runs somewhere repo-b deploys (Q4) | User's answer: an edge/serverless function beside the static site on repo-b's host, recorded in D5 and API-3. The host stays unnamed, and its function layout joins the deferred gap below. |
| API-3 can check that the session's merchant owns the order (Q5) | Deferred by the user's answer: owner team-web, placement the gate before work item 7 starts; declared in API-3. |
| Removing the token from the bundle closes the exposure (Q6) | User's answer: team-ledger rotates `SERVICE_TOKEN` after API-3 deploys and before CONFIG-1, in section 7's build order with a section 8 probe. |
| Checkout's token rotates with the ledger's | `serviceToken.ts:6-7` accepts one token and `checkout/src/clients/ledger.ts:5` sends it, so a ledger-only rotation would fail API-1's writes; section 7 rotates all three copies together. |
| Non-blocking findings left open | No CODEOWNERS file and no `scripts/deploy.sh`; no checkout ledger POST helper; no `direction` error on API-2 `POST`; duplicate `credit` on retry — see the rows above. |

### Validation pass 2 — 2026-10-25

Verdict: not ready — claims: 6 verified / 1 deferred / 0 blocked — spec 322 lines at this verdict
Checked at: repo-a @ 7dddce4, repo-b @ 1caf0fd (local `main`; no remote on either clone, so nothing to fetch)

| Claim | How it was verified |
|---|---|
| Every `path:line` in sections 2–12 still resolves | Scripted extraction printed each cited line at the commits above; all hold, including pass 1's new `ledger.yml:17-20`, `serviceToken.ts:6-7` and `repo-b/src/api/ledger.ts:3-11`. |
| Each phase is one deploy per service it touches (section 7) | Blocking, closed: phase 2 deploys API-3 before INTEGRATION-1, both repo-b, so repo-b deploys twice in phase 2. Section 7's deploy sentence corrected. |
| CONFIG-1 can flip once DB-1, API-1 and API-2 are deployed (section 4) | Non-blocking, closed: section 7 also holds CONFIG-1 until after the token rotation. CONFIG-1's limits now say so. |
| The dashboard's token is accepted by API-2 (section 4) | Non-blocking, closed: under D5 the dashboard holds no token and the rotation invalidates the bundled one. API-2's auth line now names API-3. |
| API-2 `POST` errors are complete (section 4) | Non-blocking, closed: added the 400 for a `direction` outside `debit`/`credit`, matching DB-1's CHECK and API-2's other 400s. |
| Work item 3 needs only `charge.ts:6-8` (section 6) | Non-blocking, closed: `checkout/src/clients/ledger.ts:3-7` exports only `ledgerGet`. Work item 3 now adds the POST helper there. |
| The three-copy rotation works without disruption (section 7) | `serviceToken.ts:6-7` accepts one token, so `health.ts:4-5` readiness and API-3's health fail between the first and last swap. Open, non-blocking — handed up as a risk choice. |
| API-1 writes one entry per accepted charge (section 4) | Unchanged since pass 1: a lost POST response gives a 502 charge with a row, and a retry adds a second `credit`. Open, non-blocking — now handed up as a risk choice, because the spec does not accept the failure mode. |
| CODEOWNERS and `./scripts/deploy.sh` (section 5) | Re-read `repo-a/README.md:8` and all three workflows at the commits above; neither file exists in either tree, and no workflow carries `SERVICE_TOKEN`. Open, non-blocking. |
| API-3's session, ownership source and function layout (section 4) | Deferred: owner team-web, placement the gate before work item 7 starts. |

#### Pass 2 answers applied — 2026-10-25

Verdict: ready — claims: 8 verified / 1 deferred / 0 blocked — spec 336 lines at this verdict
Checked at: repo-a @ 7dddce4, repo-b @ 1caf0fd

| Claim | How it was verified |
|---|---|
| API-1 writes one entry per accepted charge (Q1) | User's answer (a): DB-1 gains a unique `(order_id, direction)` index, and API-2 `POST` returns 200 with the existing entry on a duplicate. Section 8's DB-1 and API-2 probes now check both. |
| The three-copy rotation works without disruption (Q2) | User's answer (a): section 7 now accepts the readiness and health window, because the flag is still off during the rotation (`charge.ts:6-8`). |

### Validation pass 3 — 2026-10-25

Verdict: ready — claims: 8 verified / 1 deferred / 0 blocked — spec 360 lines at this verdict
Checked at: repo-a @ 7dddce4, repo-b @ 1caf0fd (local `main`; no remote on either clone, so nothing to fetch)

| Claim | How it was verified |
|---|---|
| Every `path:line` in sections 2–12 still resolves | Printed every file in both trees at the commits above. Every citation holds, including pass 2's `checkout/src/clients/ledger.ts:3-7`. |
| DB-1's migration runs once (section 4) | Blocking, closed: `ledger.yml:16-18` re-runs every `*.sql` file on every ledger merge with `ON_ERROR_STOP=1`, so a plain `CREATE` fails the next ledger deploy (API-2, or a phase-1 revert). DB-1 now requires `IF NOT EXISTS`. |
| API-2 `POST` errors are complete (section 4) | Non-blocking, closed: a missing or non-integer `amountMinor` hit DB-1's `BIGINT NOT NULL` with no defined response. It is now a 400, like the other input errors. |
| DB-1's unique index matches API-2's duplicate `POST` and the section 8 probes | Both key on `(order_id, direction)`. The DB-1 probe lists the index and the API-2 probe repeats the `POST` for a 200. |
| CONFIG-1 waits for the token rotation (section 4) | Its limits line matches section 7's order: API-3, then the rotation, then CONFIG-1. |
| Work item 3's POST helper (section 6) | `checkout/src/clients/ledger.ts:3-7` holds `ledgerGet` only. API-1 posts to API-2, which lands earlier in phase 1. |
| Section 7 deploy counts | Phase 1: one each for ledger, checkout and repo-b (`ledger.yml:6`, `checkout.yml:6`). Phase 2: repo-b twice, for API-3 then INTEGRATION-1, and checkout once, for CONFIG-1. |
| Build order holds (section 7) | Re-walked: DB-1, then API-2, then API-1, with UI-1 independent. In phase 2: API-3, then the rotation, then CONFIG-1, and API-3 before INTEGRATION-1. |
| One `credit` row per accepted charge (sections 2 and 4) | Open, non-blocking: DB-1 allows one `credit` row per order, while the section 2 goal and API-1 promise one per charge. A second charge on the same order (`charge.ts:1-7` allows it) gets a 200 with the old entry, even when its amount differs. |
| A lost `POST` response leaves a `credit` row for a charge that returned 502 (section 4, API-1) | Open, non-blocking: if nobody retries the charge, the row stays. The spec does not accept this risk: the Q1 row records only the unique index, not the "accepted in general" that pass 2's status stated. |
| The rotation window only costs health checks (section 7) | Open, non-blocking: `health.ts:3-5` makes checkout's readiness depend on the ledger, and nothing in either tree says whether readiness gates checkout's traffic. API-3's entries route fails during the window too, and nothing orders INTEGRATION-1 after the rotation. |
| CODEOWNERS, `./scripts/deploy.sh`, the rotation mechanism (section 5) | Open, non-blocking, unchanged: neither tree contains them (`repo-a/README.md:8`, all three workflows). |
| API-3's session, ownership source and function layout (section 4) | Deferred: owner team-web, placement the gate before work item 7 starts. |


### Validation pass 4 (post-verdict) — 2026-10-25

Verdict: ready — claims: 4 verified / 1 deferred / 0 blocked — spec NNN lines at this verdict
Checked at: repo-a @ 7dddce4, repo-b @ 1caf0fd (local `main`; no remote on either clone, so nothing to fetch)

| Claim | How it was verified |
|---|---|
| CI re-runs every migration on every ledger merge with `ON_ERROR_STOP=1` (section 4, DB-1) | `ledger.yml:6` triggers on `services/ledger/**`; `ledger.yml:16-18` loops every `*.sql` through `psql -v ON_ERROR_STOP=1`. Pass 3's citation and the `IF NOT EXISTS` requirement both hold. |
| DB-1's two indexes can be created with `IF NOT EXISTS` as written (section 4) | Non-blocking, closed: PostgreSQL's `CREATE INDEX` docs state "Index name is required when `IF NOT EXISTS` is specified", and DB-1 named neither index. DB-1 now names both. |
| API-2 `POST` 400s match DB-1's columns (section 4) | Missing → `NOT NULL`, non-integer → `BIGINT`, negative → `CHECK (amount_minor >= 0)`, `direction` → its `CHECK`. Every DB-1 rejection now has a defined 400. |
| API-1 forwards an `amountMinor` API-2 now rejects (section 4) | `charge.ts:1-7` does not validate `amountMinor`, so with the flag on, a negative or fractional charge gets a 400 from the ledger and a 502. D2 already accepts this cost, so it is not a finding. |
| API-3's session, ownership source and function layout (section 4) | Deferred: owner team-web, placement the gate before work item 7 starts. |
