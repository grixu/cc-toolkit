---
name: pr-open eval case with a manifest
status: done
spec: ../SPEC.md
elements: [TEST-3]
decisions: [D26, D35, D52, D54, D55]
repository: /Users/mateusz/grixu/cc-toolkit
branch: feat/pr-open-proof
branch-base: main
merge-after: [feat/prepare-proof]
worktree: /Users/mateusz/grixu/cc-toolkit.worktrees/task-pr-open-eval-case
phase: 4
depends-on: []
tickets: []
---

## Goal

dev-kit's promptfoo suite gains a `pr-open-proof` case, made up of:

- a fixture branch with screenshots and a long transcript;
- a sandbox reset that writes the fixture manifest at its real path;
- a gh stand-in that handles `--attach`, `{owner}`/`{repo}` and comment deletion;
- a `parse()` that leaves `## Proof` out of the length budget;
- a `proof` check;
- a promptfoo test entry.

## Done when

- TEST-3, INTEGRATION-6, UI-1 (D52) triggered row: branch-level. It runs locally on `feat/pr-open-proof` and passes once `pr-open-proof-section` is in place.

## Where to look

- TEST-3: each bullet names a file and what changes in it.
- Section 6, work item W15: the lines it changes.
- UI-1 and INTEGRATION-6: what the `proof` check asserts.
- D52, D54, D55; also D26, D35.

## Note

- Every existing stand-in call and the three existing pr-open cases keep their behaviour. The section 8 row runs them again beside the new case.
