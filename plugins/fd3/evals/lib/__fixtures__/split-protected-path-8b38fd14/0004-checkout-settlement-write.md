---
name: "Checkout: settlement write behind the flag"
status: todo
spec: ../protected-path-spec.md
elements: [API-1]
decisions: [D1, D2, D4]
repository: /sandbox/split/repo-a
branch: feat/checkout-settlement-write
branch-base: feat/ledger-entries-endpoints
worktree:
phase: "1"
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

Depends on `ledger-entries-endpoints` for `POST /ledger/entries`: this code is written against that
task's request and stored-entry shapes, including the `createdAt` field it introduces.

Leave `flags.asyncSettlement` at `false`. Flipping it is CONFIG-1's work in phase 2
(`checkout-settlement-switch`); a flip here would switch behaviour on inside a phase the spec
requires to be dark.
