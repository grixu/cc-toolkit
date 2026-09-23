# protected-path-rollout-spec — fixture contract

This file is fixture documentation only. `reset-sandboxes.sh` excludes it from the sandbox copy.
`rollout-spec` plus a seventh element whose path is owned by a team none of the others can stand
in for. It serves split-protected-path.

## The protected path

`repo-a/CODEOWNERS` gives `/.github/workflows/` to `@acme/release-team`, and section 5's ownership
table repeats it with the clause that makes it load-bearing: *which no other team can give*. The
new element **CI-1 — migration step in the deploy workflow** edits
`repo-a/.github/workflows/deploy.yml`, which that line covers.

Delete either the CODEOWNERS line or the ownership row and the cut has nothing to read: the split
then legitimately folds CI-1 into a phase-1 task with the ledger work, and the assert fails on a
split that is within contract.

## The 7-task split

The six delivery tasks of `rollout-spec` (see that fixture's DEFECTS.md for the frozen cut, the
element→owner map and the sentinel strings, which are unchanged here) **plus CI-1**, which must:

- carry CI-1 and nothing else;
- be a delivery task — `repository: repo-a`, never `repository: none`;
- sit in phase 1, where the migration it runs lands;
- come **before DB-1**: section 7 opens phase 1 with "CI-1 first (the migration step must exist
  before a migration relies on it)", so the migration task carries exactly one `depends-on` edge
  and it points at CI-1. This is the one place this fixture departs from `rollout-spec`, where
  DB-1 is the root — hence `checkBoundaries(..., { precedesDb: 'CI-1' })`;
- hold its branch **alone**: no other task may name the same branch, so release-team's approval
  gates one pull request rather than the whole phase-1 landing unit.

Seven task files, no operational task.

## Precondition material

Section 12's `### Validation pass — 2026-07-30` block opens with

`Verdict: ready — claims: 1 verified / 0 deferred / 0 blocked — spec 237 lines at this verdict`

`237` equals `wc -l` on the spec; any edit to the file must be followed by rewriting the number.
The spec is read-only in this scenario: the split writes task files and the split report beside the
spec (`spec/protected-path-spec.split.md`) and modifies nothing.

## Load-bearing line numbers

`rollout-spec`'s four, plus the workflow CI-1 edits:

- `repo-a/services/checkout/src/api/charge.ts:6` — `postCharge`
- `repo-a/services/checkout/src/config.ts:2` — `asyncSettlement: false`
- `repo-a/services/ledger/src/api/entries.ts:7` — `listEntries`
- `repo-b/src/components/PaymentStatus.tsx:5` — `PaymentStatus`
- `repo-a/.github/workflows/deploy.yml` — checkout then deploy, with no step between them
