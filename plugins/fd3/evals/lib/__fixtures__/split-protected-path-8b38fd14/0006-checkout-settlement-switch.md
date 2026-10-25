---
name: "Checkout: flip asyncSettlement on"
status: todo
spec: ../protected-path-spec.md
elements: [CONFIG-1]
decisions: [D2, D4]
repository: /sandbox/split/repo-a
branch: feat/checkout-settlement-switch
branch-base: main
worktree:
phase: "2"
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

Change the flag only. The write path it activates already exists from API-1
(`checkout-settlement-write`); this task adds no code to the charge path.
