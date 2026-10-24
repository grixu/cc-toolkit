---
name: Add the queue status table migration
status: todo
spec: ../SPEC.md
elements: [QS-DB-1]
decisions: [D1]
repository: @@REPO@@
branch: feat/queue-status
branch-base: main
worktree:
phase: 1
depends-on: []
tickets: []
---

## Goal

A migration creates the `queue_status` table the worker writes and the API reads.

## Done when

The QS-DB-1 behaviour row passes on the branch.

## Where to look

QS-DB-1 in the spec's elements table.

## Note

Confirm with the user before writing the migration: `db/migrations/` is listed under Files to protect in CLAUDE.md, and every new migration there is confirm-first.
