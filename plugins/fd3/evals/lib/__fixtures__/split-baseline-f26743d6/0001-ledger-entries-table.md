---
name: Ledger entries table migration
status: todo
spec: ../rollout-spec.md
elements: [DB-1]
decisions: [D1]
repository: /sandbox/split/repo-a
branch: feat/ledger-entries-table
branch-base: main
worktree:
phase: 1
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

This migration is irreversible once applied to the shared staging database, which is why it has a
task and a branch of its own and lands on `main` before API-2. Keep the change expand-only: no
column drops or renames, and no second migration file in this task. Do not add any code that reads
or writes the table here — that is `ledger-entries-endpoints`.
