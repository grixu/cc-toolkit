---
name: code-review Codex review reference
status: merged
spec: ../SPEC.md
elements: [INTEGRATION-7]
decisions: [D35, D36, D37, D38, D41, D42, D45, D49, D55]
repository: /Users/mateusz/grixu/cc-toolkit-collegium
branch: feat/code-review-codex-review
branch-base: main
merge-after: [feat/collegium]
worktree: /Users/mateusz/grixu/cc-toolkit-collegium.worktrees/task-cr-codex-reference
phase: 4
depends-on: []
tickets: []
---

## Goal

`plugins/code-review/references/codex-review.md` exists and is the one place that says when the
Codex review runs, what task text and `result_schema` Codex gets, how its run is parameterised, and
how its result — or its skip — is rendered into `codex.md`.

## Done when

- The INTEGRATION-7 rows (section 8) are **environment-level**: triggered `/start-cr` runs after the
  phase-3 release, exercised in `release-code-review`. On the branch, the phase's `/verify` row
  (DOCS-1–3) is branch-level and passes once `cr-docs` lands.

## Where to look

- INTEGRATION-7 — section 4, "INTEGRATION-7: code-review's Codex review", first bullet.
- API-1 and API-3 — section 4, for the inputs the reference hands Collegium.
- Section 1, "Header and precedence" — the two written rules this amends.
- Work item R2 — section 6.
