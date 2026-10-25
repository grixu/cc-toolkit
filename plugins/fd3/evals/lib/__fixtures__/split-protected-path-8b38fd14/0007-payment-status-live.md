---
name: "Dashboard: payment status on live entries"
status: todo
spec: ../protected-path-spec.md
elements: [INTEGRATION-1]
decisions: [D3, D4]
repository: /sandbox/split/repo-b
branch: feat/payment-status-live
branch-base: feat/payment-status-panel
worktree:
phase: "2"
depends-on: [payment-status-panel]
tickets: [LED-100]
---

## Goal

(cut)

## Done when

(cut)

## Where to look

(cut)

## Note

Depends on `payment-status-panel`: this task edits the same `PaymentStatus` component and deletes
the mock data module that task adds.

Removing the mock data module belongs in this task's own change — §9 Cleanup places it here, so
there is no separate cleanup task. Dropping the mock-era test fixtures is out of scope (ticket
LED-109).
