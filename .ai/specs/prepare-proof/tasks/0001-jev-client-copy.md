---
name: Copy the Jev client helpers into pr-proof
status: merged
spec: ../SPEC.md
elements: [INFRA-1]
decisions: [D11, D51]
repository: /Users/mateusz/grixu/cc-toolkit
branch: feat/prepare-proof
branch-base: main
merge-after: []
worktree: /Users/mateusz/grixu/cc-toolkit.worktrees/task-jev-client-copy
phase: 1
depends-on: []
tickets: []
---

## Goal

pr-proof has its own self-contained Jev client in `plugins/pr-proof/hooks/jev.ts`: a regular file holding the helpers copied from dev-kit, with the constants INFRA-1 sets and D51's process-based retry wait in `send`, and no import from another plugin.

## Done when

- INFRA-1 probe row: this task's.
- TEST-1, API-1 (phase 1) probe row: branch-level, passes once `proof-signals-tool` is in place.

## Where to look

- INFRA-1: the symbol table, the constants and the source commit.
- Section 6, work item W2: the source ranges.
- D11, D51.
