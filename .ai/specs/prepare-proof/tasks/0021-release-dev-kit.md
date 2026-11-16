---
name: Release dev-kit after phase 4
status: done
spec: ../SPEC.md
elements: []
decisions: [D29]
repository: none
branch:
branch-base:
merge-after:
worktree:
phase: 4
depends-on: [dev-kit-docs, pr-open-eval-case, decide-pr-risk-proof-context]
tickets: []
---

## Goal

After the `feat/pr-open-proof` PR merges, release dev-kit with `./scripts/release.sh dev-kit <bump>`. Without this release, installed sessions keep the old pr-open.

## Done when

- It inherits the final gate.
- Before releasing, run the phase-4 Draft-PR rows (the INTEGRATION-6, UI-1 family) on a sample repo.

## Where to look

- Section 7, Rollout: phase 4 and its rollback.
- Section 10, Out of scope: the dev-kit release item.
- D29.

## Note

- **Why no PR.** `release.sh` commits, tags and pushes the release on `main` by hand after the merge. The spec lists this release as a deferred item owned by Mateusz.
- **What has to come back, from Mateusz:** the bump level, chosen at release time.
