---
name: pr-open reads the manifest and writes ## Proof
status: done
spec: ../SPEC.md
elements: [INTEGRATION-6, UI-1]
decisions: [D5, D7, D13, D14, D16, D26, D27, D32, D40, D42, D45, D48, D49]
repository: /Users/mateusz/grixu/cc-toolkit
branch: feat/pr-open-proof
branch-base: main
merge-after: [feat/prepare-proof]
worktree: /Users/mateusz/grixu/cc-toolkit.worktrees/task-pr-open-proof-section
phase: 4
depends-on: []
tickets: []
---

## Goal

pr-open reads the pr-proof manifest when it exists. It renders `## Proof` by fields just before `## Risk`, and on an existing PR it inserts, replaces or removes the section. It attaches the media, adds the staleness and rewritten-history notes, sends media overflow to marked comments and clears the old ones. The section stays out of the length budget.

## Done when

- TEST-3, INTEGRATION-6, UI-1 (D52) triggered row: branch-level, passes once `pr-open-eval-case` is in place.
- These Draft-PR rows are environment-level, exercised by `release-dev-kit`:
  - INTEGRATION-6, UI-1;
  - INTEGRATION-6 (D14, D32);
  - INTEGRATION-6 (D40);
  - INTEGRATION-6 (D45);
  - INTEGRATION-6, UI-1 (D48, D49).

## Where to look

- INTEGRATION-6.
- UI-1.
- INTEGRATION-1: the manifest's path and schema.
- D45, D48, D49; also D5, D7, D13, D14, D16, D26, D27, D32, D40, D42.

## Note

- pr-open has no code dependency on pr-proof: it reads only the file (D5).
