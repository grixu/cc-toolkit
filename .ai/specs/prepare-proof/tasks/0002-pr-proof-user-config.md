---
name: Add pr-proof's userConfig options
status: merged
spec: ../SPEC.md
elements: [CONFIG-1]
decisions: [D18, D34, D50]
repository: /Users/mateusz/grixu/cc-toolkit
branch: feat/prepare-proof
branch-base: main
merge-after: []
worktree: /Users/mateusz/grixu/cc-toolkit.worktrees/task-pr-proof-user-config
phase: 1
depends-on: []
tickets: []
---

## Goal

pr-proof's `plugin.json` declares the four `userConfig` options CONFIG-1 lists, each with the fields the schema requires, and the plugin still validates.

## Done when

- CONFIG-1 probe row: this task's.
- CONFIG-1 (D50) triggered row: environment-level, it needs `screenshot-proof` and a session with saved values; `release-pr-proof` exercises it.

## Where to look

- CONFIG-1: the option table and why `screenshot_widths` has no default.
- D34, D50; also D18.

## Note

- Do not change `version`; `release.sh` bumps it.
