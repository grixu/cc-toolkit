---
name: Decide on evicting old ~/.cache/pr-proof directories
status: done
spec: ../SPEC.md
elements: []
decisions: [D6]
repository: none
branch:
branch-base:
merge-after:
worktree:
phase: 3
depends-on: [release-pr-proof]
tickets: []
---

## Goal

After the first pr-proof release, Mateusz decides whether old directories under `~/.cache/pr-proof/` need evicting. Until then, nothing is evicted.

## Done when

- No row of its own. It inherits the phase-3 gate.

## Where to look

- Section 10, Out of scope: the eviction item.
- D6.

## Note

- **Why no PR.** This is a decision the spec defers, owned by Mateusz.
- **What has to come back, from Mateusz:** "no eviction", or an eviction rule. A rule is a spec change and goes through `/fd3:build-spec`.
