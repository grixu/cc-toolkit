---
name: Commit the tuned signal questions
status: merged
spec: ../SPEC.md
elements: [API-1]
decisions: [D22, D23, D25, D46]
repository: /Users/mateusz/grixu/cc-toolkit
branch: feat/prepare-proof
branch-base: main
merge-after: []
worktree: /Users/mateusz/grixu/cc-toolkit.worktrees/task-tune-signal-wording
phase: 2
depends-on: [proof-signals-tool, measure-proof-signals]
tickets: []
---

## Goal

The tuned FACTS wording and the G4 variant that `measure-proof-signals` chose are applied to `hooks/signals.ts` in one commit, W5's only landing.

## Done when

- TEST-1, API-1 (phase 1) probe row: this task's. It still passes after the change.
- TEST-2 (phase 2) observed-only row: owned by `measure-proof-signals`.

## Where to look

- API-1: the FACTS and the per-part state.
- Section 6, work item W5.
- G4 row under "Declared gaps" in section 3.
- TEST-2.
- D22, D23, D25, D46.

## Note

- The edge onto `proof-signals-tool` exists because both tasks edit `hooks/signals.ts`, its FACTS and its state builder.
- The edge onto `measure-proof-signals` exists because the wording and the G4 variant come from its outputs. Read them from `/Users/mateusz/grixu/cc-toolkit/plugins/pr-proof/evals/proof-signals/local/`. That directory is git-ignored and does not exist in a worktree.
- Commit only the change to `hooks/signals.ts`. Nothing under `evals/proof-signals/local/` goes into a commit.
