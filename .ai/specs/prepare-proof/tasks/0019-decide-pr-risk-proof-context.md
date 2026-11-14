---
name: Decide whether proof feeds pr_risk as context
status: done
spec: ../SPEC.md
elements: []
decisions: []
repository: none
branch:
branch-base:
merge-after:
worktree:
phase: 4
depends-on: [pr-open-proof-section]
tickets: []
---

## Goal

At the phase-4 review, Mateusz decides whether pr-open should pass the proof to `pr_risk` as `context` on a new PR, where that evidence otherwise goes uncredited.

## Done when

- No row of its own. It inherits the final gate.

## Where to look

- Section 10, Out of scope: the `pr_risk` context item.
- INTEGRATION-6.

## Note

- **Why no PR.** This is a decision the spec defers to the phase-4 review, owned by Mateusz.
- **What has to come back, from Mateusz:** "no", or "yes". A yes is a spec change and goes through `/fd3:build-spec`.
