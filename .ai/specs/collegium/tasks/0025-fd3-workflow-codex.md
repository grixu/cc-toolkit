---
name: fd3 workflow runs the Codex review, with tests
status: todo
spec: ../SPEC.md
elements: [INTEGRATION-8, TEST-4]
decisions: [D34, D37, D44, D52, D55]
repository: /Users/mateusz/grixu/cc-toolkit-collegium
branch: feat/fd3-codex-review
branch-base: main
merge-after: [feat/code-review-codex-review]
worktree:
phase: 5
depends-on: []
tickets: []
---

## Goal

`implement-run.js` takes a `codexReview` arg, appends `--codex` to the prepare prompt, dispatches
`codex` as its own scanner agent even on the single-scan path, never counts it as dead, and keeps
it out of the delta review's fix lenses; `implement-review.test.mjs` covers those paths.

## Done when

- INTEGRATION-8, TEST-4 row (section 8): `node --test 'plugins/fd3/tests/workflows/*.test.mjs'`
  passes — this task's part. The row's triggered fd3 run is **environment-level**, exercised in
  `release-fd3`.

## Where to look

- INTEGRATION-8 — section 4, "INTEGRATION-8: fd3 wiring", the `implement-run.js` bullet.
- TEST-4 — section 4, "TEST-4: fd3 workflow tests".
- Work items F2 and F3 — section 6.
