---
name: Run the queue worker in local compose
status: todo
spec: ../SPEC.md
elements: [QS-RUN-1]
decisions: []
repository: @@REPO@@
branch: feat/queue-status
branch-base: main
worktree:
phase: 1
depends-on: []
tickets: []
---

## Goal

The local compose stack starts a `worker` service next to `api`.

## Done when

Inherits phase 1 verification.

## Where to look

QS-RUN-1 in the spec's elements table.

## Note

Confirm with the user before editing `docker-compose.yml`: it is listed under Files to protect in CLAUDE.md.
