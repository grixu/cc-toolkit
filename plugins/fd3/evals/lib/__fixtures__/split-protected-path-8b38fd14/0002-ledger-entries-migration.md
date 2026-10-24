---
name: "Ledger: ledger_entries table migration"
status: todo
spec: ../protected-path-spec.md
elements: [DB-1]
decisions: [D1]
repository: /sandbox/split/repo-a
branch: feat/ledger-entries-migration
branch-base: feat/ci-migration-step
worktree:
phase: "1"
depends-on: [ci-migration-step]
tickets: [LED-100]
---

## Goal

(cut)

## Done when

(cut)

## Where to look

(cut)

## Note

The order onto `ci-migration-step` is one the spec binds, not a file this task shares: "Build order
within phase 1: CI-1 first (the migration step must exist before a migration relies on it), then
DB-1 (the migration must be applied before any writer or reader ships)."

This migration is irreversible once applied to the shared staging database, and expand-only: no
column drops or renames, here or later in this spec.
