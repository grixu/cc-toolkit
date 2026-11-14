---
name: Review the measurement and the G4 variant
status: done
spec: ../SPEC.md
elements: []
decisions: [D22, D25]
repository: none
branch:
branch-base:
merge-after:
worktree:
phase: 2
depends-on: [measure-proof-signals, tune-signal-wording]
tickets: []
---

## Goal

Mateusz reviews the measurement's ground-truth table and figures and the G4 variant it kept (commits in the Jev state or not), together with the `tune-signal-wording` commit. This closes declared gap G4.

## Done when

- No row of its own. It inherits the TEST-2 (phase 2) observed-only row.

## Where to look

- G4 row under "Declared gaps" in section 3.
- TEST-2.
- D22, D25.

## Note

- **Why no PR.** This is a human review of git-ignored labels and figures in `/Users/mateusz/grixu/cc-toolkit/plugins/pr-proof/evals/proof-signals/local/`, and of a commit already on `feat/prepare-proof`.
- **What has to come back, from Mateusz:** the table accepted, or corrections to it. A correction re-runs `measure-proof-signals` and `tune-signal-wording`.
- The rest of the branch does not wait for this review (Mateusz, 2026-11-11); only `release-pr-proof` does.
