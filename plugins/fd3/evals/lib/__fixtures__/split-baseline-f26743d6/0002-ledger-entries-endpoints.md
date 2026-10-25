---
name: Ledger entries GET and POST endpoints
status: todo
spec: ../rollout-spec.md
elements: [API-2]
decisions: [D1, D3]
repository: /sandbox/split/repo-a
branch: feat/ledger-entries-api
branch-base: feat/ledger-entries-table
worktree:
phase: 1
depends-on: [ledger-entries-table]
tickets: [LED-100]
---

## Goal

(cut)

## Done when

(cut)

## Where to look

(cut)

## Note

This branch is stacked on `feat/ledger-entries-table` because the spec's phase-1 build order puts
the migration first — the query cannot run against a table that has not been applied. Scope the
pull request to `services/ledger/` only: repo-a requires one subtree per pull request, and
touching `services/checkout/` here would pull in a second team's approval.
