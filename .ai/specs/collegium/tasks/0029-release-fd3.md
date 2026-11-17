---
name: Gate 5 — merge PR 3, release fd3, triggered run (G5)
status: todo
spec: ../SPEC.md
elements: [INTEGRATION-8]
decisions: [D44, D55]
repository: none
branch:
branch-base:
merge-after: []
worktree:
phase: 5
depends-on: [fd3-docs, fd3-workflow-codex, release-code-review]
tickets: []
---

## Goal

Phase 5's gate is passed: PR 3 is merged, `./scripts/release.sh fd3 minor` has run and is
installed, and a triggered fd3 run with `codexReview: true` has produced `codex.md` in its review
directory — which also answers gap G5.

## Done when

This task inherits phase 5's gate (section 7, rollout table, phase 5 "Gate after?") and exercises
the environment-level part of the INTEGRATION-8, TEST-4 row: the triggered fd3 run.

## Where to look

- Section 7, "Rollout" — phase 5 row and the ordering paragraph.
- Section 8, "Verification" — the INTEGRATION-8, TEST-4 row.
- Gap G5 — section 12, "Declared gaps".

## Note

No pull request exists: merging PR 3, releasing, installing and the triggered run are hand steps no
branch carries. The run needs code-review's R3 released and installed (`release-code-review`).
What has to come back for G5, from the spec team (Mateusz Gostański): whether the workflow scanner
called the Collegium tools without a permission prompt; a denied call shows as
`skipped: codex — permission denied`, not as a dead review.
