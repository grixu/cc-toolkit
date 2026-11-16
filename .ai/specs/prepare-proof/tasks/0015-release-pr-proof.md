---
name: Release pr-proof at the phase-3 gate
status: done
spec: ../SPEC.md
elements: []
decisions: [D29]
repository: none
branch:
branch-base:
merge-after:
worktree:
phase: 3
depends-on: [pr-proof-docs, tune-signal-wording, review-g4-commit-variant, review-g5-result-size]
tickets: []
---

## Goal

After the `feat/prepare-proof` PR merges, release pr-proof with `./scripts/release.sh pr-proof minor`, so installed sessions get the new skills and tool.

## Done when

- It inherits the phase-3 gate.
- Before releasing, run the environment-level rows the phase-3 tasks name on a sample repo: CONFIG-1 (D50), and the triggered rows for INTEGRATION-1 through INTEGRATION-5, D44 included.

## Where to look

- Section 7, Rollout: the gate, the release command and the rollback.
- Section 5, Ownership: the apply mechanism.
- D29.

## Note

- **Why no PR.** `release.sh` commits, tags and pushes the release on `main` by hand after the merge, as this repository does for every release. It now also bumps the marketplace's own version and adds a `marketplace/v…` tag.
- The edges onto `review-g4-commit-variant` and `review-g5-result-size` exist because D29 requires the measurement to have run and been reviewed before the release.
- The sample-repo rows need Mateusz's approvals of screenshots and video (D31) and a running app.
