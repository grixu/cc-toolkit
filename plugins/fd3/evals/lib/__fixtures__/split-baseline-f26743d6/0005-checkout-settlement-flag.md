---
name: Flip the settlement flag on
status: todo
spec: ../rollout-spec.md
elements: [CONFIG-1]
decisions: [D2, D4]
repository: /sandbox/split/repo-a
branch: feat/checkout-settlement-flag
branch-base: feat/checkout-settlement-write
worktree:
phase: 2
depends-on: []
tickets: [LED-100]
---

## Goal

(cut)

## Done when

(cut)

## Where to look

(cut)

## Note

The flag flip is the whole change: do not touch the write path in `charge.ts`. This branch is
stacked on `feat/checkout-settlement-write` because the spec admits the flip only after DB-1, API-1
and API-2 are deployed — flipping it onto a `main` without the write would switch nothing. It must
not merge until phase 1 is deployed and its verification rows pass (§7); the rollback for this
task is flipping the flag back. Scope the pull request to `services/checkout/` only.
