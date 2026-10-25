---
name: Add the Redis client dependency
status: todo
spec: ../SPEC.md
elements: [QS-DEP-1]
decisions: [D2]
repository: @@REPO@@
branch: feat/queue-status
branch-base: main
worktree:
phase: 1
depends-on: []
tickets: []
---

## Goal

The worker can import a Redis client for its per-queue lock (D2).

## Done when

Inherits phase 1 verification.

## Where to look

QS-DEP-1 in the spec's elements table.

## Note

Adding the dependency regenerates `pnpm-lock.yaml`, which CLAUDE.md lists under Files to protect: confirm with the user before committing it.
