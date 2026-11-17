---
name: Transcript masking script
status: merged
spec: ../SPEC.md
elements: [INFRA-2]
decisions: [D17]
repository: /Users/mateusz/grixu/cc-toolkit
branch: feat/prepare-proof
branch-base: main
merge-after: []
worktree: /Users/mateusz/grixu/cc-toolkit.worktrees/task-mask-script
phase: 3
depends-on: [measure-proof-signals]
tickets: []
---

## Goal

`terminal-proof` has a deterministic Bash masking script, compatible with BSD and GNU `sed -E`, that replaces secrets in a transcript and exits non-zero whenever it cannot write its output.

## Done when

- INFRA-2 probe row: this task's, including ShellCheck in CI.

## Where to look

- INFRA-2: the path, the exit contract and the patterns.
- D17.

## Note

- The edge onto `measure-proof-signals` comes from the spec's ordering, not a shared file. Section 7: "Phase 3 is written after phase 2 by D29". Mateusz chose to apply it to all of phase 3 on 2026-11-11.
