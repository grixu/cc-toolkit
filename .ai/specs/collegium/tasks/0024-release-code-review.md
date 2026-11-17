---
name: Gate 4 — merge PR 2, release code-review, live checks
status: todo
spec: ../SPEC.md
elements: [CONFIG-3, INTEGRATION-7]
decisions: [D35, D49]
repository: none
branch:
branch-base:
merge-after: []
worktree:
phase: 4
depends-on: [cr-docs, release-collegium]
tickets: []
---

## Goal

Phase 4's gate is passed: PR 2 is merged, `./scripts/release.sh code-review minor` has run, the
release is installed, and the triggered `/start-cr` checks have shown the Codex review delivering
and skipping.

## Done when

This task inherits phase 4's gate (section 7, rollout table, phase 4 "Gate after?") and exercises
the environment-level rows:

- CONFIG-3, INTEGRATION-7 — triggered `/start-cr` with Codex enabled and `collegium_run: always`;
- INTEGRATION-7 skip — the same with Codex disabled.

## Where to look

- Section 7, "Rollout" — phase 4 row and the ordering paragraph.
- Section 8, "Verification" — the two rows above.
- Section 5, "Ownership".

## Note

No pull request exists: merging PR 2, running `release.sh`, installing and running the triggered
reviews are hand steps no branch carries. The live check needs collegium released and installed,
which `release-collegium` does.
