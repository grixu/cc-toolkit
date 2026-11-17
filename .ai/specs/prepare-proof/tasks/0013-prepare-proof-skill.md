---
name: prepare-proof skill
status: merged
spec: ../SPEC.md
elements: [INTEGRATION-2]
decisions: [D2, D3, D4, D10, D12, D19, D21, D24, D27, D38, D40, D43, D44]
repository: /Users/mateusz/grixu/cc-toolkit
branch: feat/prepare-proof
branch-base: main
merge-after: []
worktree: /Users/mateusz/grixu/cc-toolkit.worktrees/task-prepare-proof-skill
phase: 3
depends-on: [measure-proof-signals, screenshot-proof-skill, terminal-proof-skill, walkthrough-record-only]
tickets: []
---

## Goal

A new `prepare-proof` skill:

- judges each proof kind, with Jev signals when available;
- confirms the whole plan once;
- owns all stack handling, including the optional base stack;
- routes to the executors in order;
- writes the video and "no proof" manifest entries;
- reports what happened.

## Done when

All of these triggered rows are environment-level, exercised by `release-pr-proof`:

- INTEGRATION-1, INTEGRATION-2. Its with-Jev half also needs the user's TypeSafe key.
- INTEGRATION-2 (D43).
- INTEGRATION-2 (D27, D43).
- The D44 rows: URL, second stack, leftover worktree, no base.

## Where to look

- INTEGRATION-2: the steps.
- INTEGRATION-1: the manifest and `base`.
- TEST-2: the judging draft this skill takes in.
- D3, D10, D38, D43, D44; also D2, D4, D12, D19, D21, D24, D27, D40.

## Note

- The edges onto `screenshot-proof-skill`, `terminal-proof-skill` and `walkthrough-record-only` exist because this skill invokes the skills and argument contracts those tasks define, including walkthrough-video's `record-only`.
- The edge onto `measure-proof-signals` exists because the judging section moves in from its phase-2 draft. Read that draft from `/Users/mateusz/grixu/cc-toolkit/plugins/pr-proof/evals/proof-signals/local/`. That directory is git-ignored and does not exist in a worktree.
