---
name: Add the queue status script
status: merged
spec: ../app/docs/spec.md
elements: [QS-1]
decisions: []
repository: @@SANDBOX@@/app
branch: feat/queue-status
branch-base: main
worktree:
phase: 1
depends-on: []
tickets: []
---

## Goal

`src/status.sh` prints the queue's pending count as one status line.

## Done when

The QS-1 behaviour row passes on the branch.

## Where to look

QS-1 in the spec.
