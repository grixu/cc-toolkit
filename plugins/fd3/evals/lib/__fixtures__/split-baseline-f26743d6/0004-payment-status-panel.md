---
name: Payment status panel rendering against a mock
status: todo
spec: ../rollout-spec.md
elements: [UI-1]
decisions: [D3, D4]
repository: /sandbox/split/repo-b
branch: feat/payment-status-panel
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

Keep the component out of the router and off the network in this task: wiring it to the live
endpoint and routing it is phase 2, in `payment-status-live-endpoint`. The mock data module you add
here is removed by that task, so leave it in a place a single later commit can delete.
