# gap-rollout-spec — fixture contract

This file is fixture documentation only. `reset-sandboxes.sh` excludes it from the sandbox copy.
`rollout-spec` with one change: its last verdict line carries a blocked claim that the spec itself
declares as a gap. It serves split-declared-gap.

## The declared gap

Section 7 names the unmeasured ledger write ceiling, its owner (**the platform team**) and its
placement (**a gate before phase 2**). Section 12's `### Validation pass — 2026-07-30` block counts
it, so the verdict line reads:

`Verdict: ready — claims: 1 verified / 0 deferred / 1 blocked — spec 224 lines at this verdict`

All three halves are load-bearing. `ready` with a blocked claim is what the precondition must
accept; the owner and the placement are what make it a declared gap rather than a stop; and `224`
equals `wc -l` on the spec, so any edit to the file must be followed by rewriting the number.
Removing the owner from section 7 turns this fixture into a stop-before-step-1 case and breaks the
scenario — that case has its own fixture, `ownerless-gap-payments-spec`, on the validate side.

## The 7-task split

The six delivery tasks of `rollout-spec` (see that fixture's DEFECTS.md for the frozen cut, the
element→owner map and the sentinel strings, which are unchanged here) **plus one operational task**
for the gap: `repository: none`, no branch, no element code, and a `## Note` naming the platform
team and the phase-2 gate. Seven task files, exactly one of them operational.

## Precondition material

Unlike `rollout-spec`, the spec is read-only in this scenario: the split writes task files and the
split report beside the spec (`spec/gap-rollout-spec.split.md`) and modifies nothing.

## Load-bearing line numbers

Identical to `rollout-spec`:

- `repo-a/services/checkout/src/api/charge.ts:6` — `postCharge`
- `repo-a/services/checkout/src/config.ts:2` — `asyncSettlement: false`
- `repo-a/services/ledger/src/api/entries.ts:7` — `listEntries`
- `repo-b/src/components/PaymentStatus.tsx:5` — `PaymentStatus`
