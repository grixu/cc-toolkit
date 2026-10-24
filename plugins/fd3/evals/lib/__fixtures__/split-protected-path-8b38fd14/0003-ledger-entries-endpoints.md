---
name: "Ledger: entries GET and POST endpoints"
status: todo
spec: ../protected-path-spec.md
elements: [API-2]
decisions: [D1, D3]
repository: /sandbox/split/repo-a
branch: feat/ledger-entries-endpoints
branch-base: feat/ledger-entries-migration
worktree:
phase: "1"
depends-on: [ledger-entries-migration]
tickets: [LED-100]
---

## Goal

(cut)

## Done when

(cut)

## Where to look

(cut)

## Note

Depends on `ledger-entries-migration` for the table it reads: the query and the stored-entry
response are written against that migration's columns.

This task owns the entry response shape — it adds `createdAt` to what the endpoint returns, beyond
the shape the current stub's interface declares. Propagate that shape to every consumer inside the
ledger service here; `checkout-settlement-write` is written against it and has an edge onto this
task.
