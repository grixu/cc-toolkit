---
name: Flag-guarded settlement write from checkout
status: todo
spec: ../rollout-spec.md
elements: [API-1]
decisions: [D1, D2]
repository: /sandbox/split/repo-a
branch: feat/checkout-settlement-write
branch-base: feat/ledger-entries-api
worktree:
phase: 1
depends-on: [ledger-entries-endpoints]
tickets: [LED-100]
---

## Goal

(cut)

## Done when

(cut)

## Where to look

(cut)

## Note

Do not flip `flags.asyncSettlement` here — the flip is phase 2 and belongs to
`checkout-settlement-flag`. This branch is stacked on `feat/ledger-entries-api` because the spec
states checkout deploys after ledger within phase 1 and the write has no endpoint to call before
then. Scope the pull request to `services/checkout/` only: repo-a requires one subtree per pull
request.
