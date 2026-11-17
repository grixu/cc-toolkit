---
name: fd3 implement-tasks step-2 Codex question
status: todo
spec: ../SPEC.md
elements: [INTEGRATION-8]
decisions: [D34, D38, D45, D54]
repository: /Users/mateusz/grixu/cc-toolkit-collegium
branch: feat/fd3-codex-review
branch-base: main
merge-after: [feat/code-review-codex-review]
worktree:
phase: 5
depends-on: [probe-configure-json, fd3-workflow-codex]
tickets: []
---

## Goal

`implement-tasks` step 2, when it offers a review, settles whether the review adds a Codex review —
from code-review's saved `collegium_run` or by asking — and passes the answer to the workflow
launch as `codexReview`.

## Done when

- The INTEGRATION-8 row's triggered fd3 run (section 8) is **environment-level**, exercised in
  `release-fd3`. On the branch, the phase's `/verify` row is branch-level.

## Where to look

- INTEGRATION-8 — section 4, the `implement-tasks` step-2 bullet.
- D54 — section 3; gap G6 — section 12, "Declared gaps".
- Work item F1 — section 6.

## Note

Write the saved-value read against the G6 answer `probe-configure-json` records in
`.ai/specs/collegium/evidence/spikes.md`, by G6's rule: printed → D54 as written; not printed →
step 2 asks whenever Collegium is installed with Codex enabled. The launch arg is the `codexReview`
arg `fd3-workflow-codex` adds to `implement-run.js`. This task's output lands on
`feat/fd3-codex-review` with the rest of phase 5.
