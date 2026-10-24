---
name: Expose GET /queue/status
status: todo
spec: ../SPEC.md
elements: [QS-API-1]
decisions: [D1]
repository: @@REPO@@
branch: feat/queue-status
branch-base: main
worktree:
phase: 1
depends-on: [queue-status-repository]
tickets: []
---

## Goal

`GET /queue/status` returns one row per queue from the repository.

## Done when

The QS-API-1 behaviour row passes on the branch.

## Where to look

QS-API-1 in the spec's elements table.
