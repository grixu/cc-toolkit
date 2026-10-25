---
name: Panel on live ledger data, routed
status: todo
spec: ../rollout-spec.md
elements: [INTEGRATION-1]
decisions: [D3, D4]
repository: /sandbox/split/repo-b
branch: feat/payment-status-live
branch-base: feat/payment-status-panel
worktree:
phase: 2
depends-on: [payment-status-panel, ledger-entries-endpoints]
tickets: [LED-100]
---

## Goal

(cut)

## Done when

(cut)

## Where to look

(cut)

## Note

This branch is stacked on `feat/payment-status-panel` because both tasks edit
`src/components/PaymentStatus.tsx` and this one deletes the mock module that task adds. The edge
onto `ledger-entries-endpoints` is the endpoint this panel calls — write against the contract in
spec §4 API-2, do not re-derive it from the ledger's code. Delete the mock data module here; the
mock-era test fixtures are explicitly out of scope (LED-109). Rollback for this task is un-routing
the panel.
