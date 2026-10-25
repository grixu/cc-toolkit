---
name: "Dashboard: payment status panel on mock data"
status: todo
spec: ../protected-path-spec.md
elements: [UI-1]
decisions: [D3, D4]
repository: /sandbox/split/repo-b
branch: feat/payment-status-panel
branch-base: main
worktree:
phase: "1"
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

Keep the component unrouted and its data from the local mock module only. The live endpoint call
and the routing are INTEGRATION-1's work in phase 2 (`payment-status-live`), which replaces the
mock module this task adds — so keep that module in one place with a clear seam.
