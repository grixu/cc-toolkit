---
name: Shared rules and the manifest contract
status: merged
spec: ../SPEC.md
elements: [DOCS-1, INTEGRATION-1]
decisions: [D6, D12, D13, D28, D31, D36, D37, D39, D40]
repository: /Users/mateusz/grixu/cc-toolkit
branch: feat/prepare-proof
branch-base: main
merge-after: []
worktree: /Users/mateusz/grixu/cc-toolkit.worktrees/task-shared-rules-manifest
phase: 3
depends-on: [measure-proof-signals]
tickets: []
---

## Goal

pr-proof's shared rules move from `walkthrough-video`'s briefs to `plugins/pr-proof/references/rules.md`, which now also carries the manifest's path, schema and `jq` write recipe, the approval rule and the agent-caller block. `walkthrough-video` reads the new file, and the old one is gone in the same commit.

## Done when

- DOCS-1 probe row: this task's.
- INTEGRATION-1 (D36) triggered row: environment-level, it needs a sample repo and the executors; `release-pr-proof` exercises it.

## Where to look

- DOCS-1: what moves, what is added, and how skills read it.
- INTEGRATION-1: the path, the schema and the write rule.
- Section 9, Cleanup: the removal.
- D28, D36, D37; also D6, D12, D13, D31, D39, D40.

## Note

- The edge onto `measure-proof-signals` comes from the spec's ordering, not a shared file. Section 7: "Phase 3 is written after phase 2 by D29". Mateusz chose to apply it to all of phase 3 on 2026-11-11.
- Move `briefs/rules.md` unchanged and remove it in the commit that adds its replacement (section 9).
