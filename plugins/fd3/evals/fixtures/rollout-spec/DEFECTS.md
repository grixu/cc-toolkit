# rollout-spec — fixture contract

This file is fixture documentation only. `reset-sandboxes.sh` excludes it from the sandbox copy.
The fixture is shared by split-baseline (correct split), split-english-artifacts (English
artifacts; Polish conversation) and build-spec-reentry (re-validation of a finished spec), and is
the base of four derived fixtures: `unvalidated-rollout-spec`, `orphan-rollout-spec`,
`stale-origin-rollout-spec` and `ratified-rollout-spec`.

## The frozen 6-task split (decision, EVALS_PLAN section 6)

Exactly six tasks, exercising all four cut boundaries at once:

1. **DB-1** alone — migration task, repo-a / `services/ledger`, phase 1, no depends-on
   (irreversibility cuts, moves to the front).
2. **API-2** — repo-a / `services/ledger`, phase 1, depends on the DB-1 task.
3. **API-1** — repo-a / `services/checkout`, phase 1, depends on the API-2 task (build order:
   DB-1 → API-2 → API-1; monorepo ownership cuts API-1 away from API-2). API-1 writes through
   API-2's `POST /ledger/entries`, and that endpoint must stay in API-2's contract and work
   item: without it the write path has no builder, and the split stops on a coverage gap.
4. **UI-1** — repo-b, phase 1, no depends-on (repository cuts).
5. **CONFIG-1** — repo-a / `services/checkout`, phase 2 (phase cuts CONFIG-1 away from API-1).
6. **INTEGRATION-1** — repo-b, phase 2 (phase cuts INTEGRATION-1 away from UI-1).

Element→owner map the assertions rely on: DB-1, API-2 → team-ledger subtree; API-1, CONFIG-1 →
team-checkout subtree; UI-1, INTEGRATION-1 → repo-b. No task may mix elements across that map's
groups, and DB-1 must sit alone.

## Sentinel strings (index-card rule)

Planted in the spec's element contracts; they must NOT appear in any task file body:

- `amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0)` (DB-1 schema line)
- `repo-a/services/ledger/src/api/entries.ts:7-10` (a path:line list)
- `repo-a/services/checkout/src/api/charge.ts:6-8` (a path:line list)

Task bodies must also carry no `path:line` reference at all — pointers go by element code and
section heading.

## No operational task — load-bearing wording

Section 7 says the waiting period between phases is **none** and that no gate exists outside the
spec's own verification. This wording is load-bearing: a soak/waiting gate would let the skill
create a legitimate operational task (`repository: none`, no branch) as a seventh task, and the
frozen 6-task assert would fail on a split that is actually within contract. Do not reintroduce a
waiting period here without unfreezing the task count.

## Precondition material

The `### Validation pass — 2026-07-30` sub-heading in section 12 is what satisfies the
split-to-tasks precondition without conversation context. The dated block opens with the verdict
line the precondition reads — `Verdict: ready — claims: 1 verified / 0 deferred / 0 blocked — spec
220 lines at this verdict` — and a dated heading alone would not satisfy it. Two of its numbers are
load-bearing: zero blocked claims, and a line count equal to `wc -l` on this file. Any edit to the
spec, anywhere, changes that count and must be followed by rewriting the number.
`unvalidated-rollout-spec` is this spec with that sub-heading removed; `orphan-rollout-spec` is this
spec plus an `API-3` element that no section 6 work item names, its verdict line recounted for the
longer file. Regenerate all four derived fixtures, repos included, after any edit here.

## Every existing thing the spec names is in the trees

A re-validation reads the whole spec against both repositories, so everything the spec says
already exists has a file behind it, cited in section 4's prerequisites and section 12. Without
them every re-entry run spent passes and user questions on prerequisites nothing could back.

- Service token: `repo-a/services/ledger/src/middleware/serviceToken.ts` (`requireServiceToken`),
  guarding the routes in `repo-a/services/ledger/src/server.ts` (`GET /ledger/health`,
  `GET /ledger/entries` → the stub; no `POST` — API-2 adds it).
- Callers that send it today: `repo-a/services/checkout/src/clients/ledger.ts` (used by
  `repo-a/services/checkout/src/health.ts`) and `repo-b/src/api/ledger.ts`, both on
  `GET /ledger/health` only, so `postCharge` still makes no outbound call.
- CI: `repo-a/.github/workflows/ledger.yml` applies `services/ledger/migrations/*.sql` in glob order
  (lines 13-18) before deploying; `repo-a/.github/workflows/checkout.yml` and
  `repo-b/.github/workflows/deploy.yml` deploy on merge to `main`. No element edits a workflow, so
  the protected-path cut finds nothing here (that case is `protected-path-rollout-spec`).
- Dashboard shell: `repo-b/src/session.ts`, `repo-b/src/router.tsx` (routes `/orders/:orderId` to
  `repo-b/src/pages/OrderDetail.tsx`, never `PaymentStatus`), `repo-b/src/components/ErrorBanner.tsx`,
  `repo-b/src/preview/index.tsx`.

Still unbacked, and left as they are: API-1's flag-on "test environment" in section 8, and section
7's rollback citing LED-109, which section 10 gives to team-web's fixture cleanup — validation may
still raise both.

## Load-bearing line numbers

- `repo-a/services/checkout/src/api/charge.ts:6` — `postCharge`
- `repo-a/services/checkout/src/config.ts:2` — `asyncSettlement: false`
- `repo-a/services/ledger/src/api/entries.ts:7` — `listEntries`
- `repo-b/src/components/PaymentStatus.tsx:5` — `PaymentStatus`
