---
name: Document the queue status endpoint
status: todo
spec: ../SPEC.md
elements: [QS-DOC-1]
decisions: []
repository: @@REPO@@
branch: feat/queue-status
branch-base: main
worktree:
phase: 1
depends-on: [status-endpoint]
tickets: []
---

## Goal

`docs/api.md` describes `GET /queue/status` and its response.

## Done when

Inherits phase 1 verification.

## Where to look

QS-DOC-1 in the spec's elements table.
