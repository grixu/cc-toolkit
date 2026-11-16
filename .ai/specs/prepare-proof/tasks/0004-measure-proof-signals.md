---
name: Measure Jev signals on labelled PRs
status: merged
spec: ../SPEC.md
elements: [TEST-2]
decisions: [D25, D41, D46]
repository: /Users/mateusz/grixu/cc-toolkit
branch: feat/prepare-proof
branch-base: main
merge-after: []
worktree: /Users/mateusz/grixu/cc-toolkit.worktrees/task-measure-proof-signals
phase: 2
depends-on: [proof-signals-tool]
tickets: []
---

## Goal

An agent selects 20-30 of the user's PRs and proposes, for each one, the proof kinds it needed: the ground-truth table TEST-2 measures against. It builds and runs the harness, which compares the Jev signals from `signals.ts` with the skill judging alone. It drafts the "skill alone" judging section that `prepare-proof-skill` later moves into INTEGRATION-2. It runs G4's comparison of the state with and without commits, checks the result size on G5's largest PR, and observes D46's aggregation.

## Done when

- TEST-2 (phase 2) observed-only row: this task's. It has no pass threshold (D25).
- API-1 (key) triggered row: this task's, exercised by the measurement's live calls.

## Where to look

- TEST-2: the measurement and its arms.
- G4 and G5 rows under "Declared gaps" in section 3.
- Section 7, Rollout: the orderings inside this spec.
- D25, D41, D46.

## Note

- **Fully automatic** (Mateusz, 2026-11-11). Propose the ground-truth table yourself: the PR, the proof kinds it needed, and a one-line reason. Mateusz reviews the table, the figures and the `tune-signal-wording` commit at the end of the branch, through `review-g4-commit-variant` and `review-g5-result-size`. A correction to the table re-runs this task and `tune-signal-wording`.
- **PR source.** Use all of the user's PRs, `gh search prs --author @me`, across every repository. Pick a mix that covers screenshots, video, API, terminal and no-behaviour-change PRs.
- **Key.** Read it from `TYPESAFE_API_KEY` in the environment. Check it with `test -n "$TYPESAFE_API_KEY"`, and never print it.
- **No commit.** The labels and samples may come from private repositories, so they stay git-ignored in this public repository (D41). Write everything under `/Users/mateusz/grixu/cc-toolkit/plugins/pr-proof/evals/proof-signals/local/` in the main checkout. That directory does not exist in a task worktree.
- **Outputs, all in that directory:**
  - the ground-truth table;
  - the figures;
  - the chosen G4 variant (commits in the state or not);
  - the tuned FACTS wording;
  - the G5 result-size observation;
  - the judging draft.
