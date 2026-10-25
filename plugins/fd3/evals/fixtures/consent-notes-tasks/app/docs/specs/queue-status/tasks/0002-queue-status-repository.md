---
name: Read queue status rows
status: todo
spec: ../SPEC.md
elements: [QS-DB-2]
decisions: [D1]
repository: @@REPO@@
branch: feat/queue-status
branch-base: main
worktree:
phase: 1
depends-on: [queue-status-table]
tickets: []
---

## Goal

A repository function returns every `queue_status` row.

## Done when

Inherits phase 1 verification.

## Where to look

QS-DB-2 in the spec's elements table.
