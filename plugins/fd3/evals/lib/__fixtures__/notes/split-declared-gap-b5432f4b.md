---
name: Measure the ledger write ceiling (declared gap)
status: todo
spec: ../gap-rollout-spec.md
elements: []
decisions: [D2]
repository: none
branch:
branch-base:
worktree:
phase: 2
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

No pull request exists for this task: the measurement is run by hand against the shared staging
instance and no repository carries its steps. What has to come back, and from whom: the platform
team owns the measurement and reports how many settlement writes per second the instance sustains
before the connection pool saturates. Until that number is recorded, phase 2 does not start — the
flag flip and the dashboard's live wiring are both held behind it. The result is a recorded
measurement, not a file in a repository, so nothing from this task lands on a branch.
