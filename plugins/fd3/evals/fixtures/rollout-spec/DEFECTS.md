# rollout-spec — fixture contract

This file is fixture documentation only. `reset-sandboxes.sh` excludes it from the sandbox copy.
The fixture is shared by split-baseline (correct split), split-english-artifacts (English
artifacts; Polish conversation), and — minus the validation sub-heading / plus the orphan
element — by the two derived fixtures.

## The frozen 6-task split (decision, EVALS_PLAN section 6)

Exactly six tasks, exercising all four cut boundaries at once:

1. **DB-1** alone — migration task, repo-a / `services/ledger`, phase 1, no depends-on
   (irreversibility cuts, moves to the front).
2. **API-2** — repo-a / `services/ledger`, phase 1, depends on the DB-1 task.
3. **API-1** — repo-a / `services/checkout`, phase 1, depends on the API-2 task (build order:
   DB-1 → API-2 → API-1; monorepo ownership cuts API-1 away from API-2).
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
split-to-tasks precondition without conversation context. `unvalidated-rollout-spec` is this spec with
that sub-heading removed; `orphan-rollout-spec` is this spec plus an `API-3` element that no section 6
work item names.

## Load-bearing line numbers

- `repo-a/services/checkout/src/api/charge.ts:6` — `postCharge`
- `repo-a/services/checkout/src/config.ts:2` — `asyncSettlement: false`
- `repo-a/services/ledger/src/api/entries.ts:7` — `listEntries`
- `repo-b/src/components/PaymentStatus.tsx:5` — `PaymentStatus`
