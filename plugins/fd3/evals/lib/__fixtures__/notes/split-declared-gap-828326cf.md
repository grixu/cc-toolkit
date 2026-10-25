---
name: Measure and record the ledger database write ceiling (declared gap)
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

No pull request exists for this task: the work is a measurement against the live staging
database, by hand, and it changes no repository. Owner: the **platform team** — what has to come
back from them is the sustained writes-per-second the shared staging ledger instance holds before
the connection pool saturates, recorded somewhere the rollout can cite.

Nothing here blocks *writing* any other task: the phase-1 elements land dark and write nothing,
and the phase-2 code is identical whatever the measurement says. The gate holds the phase-2
*deploy*, which is why no task carries a `depends-on` edge onto this one — see the split report's
branch sections for how `feat/checkout-settlement-flag` and `feat/payment-status-live-data` land.
