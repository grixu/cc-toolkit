---
name: Prompt wrapper, envelope and strict-schema check
status: done
spec: ../SPEC.md
elements: [INTEGRATION-4, TEST-1]
decisions: [D21, D22, D23, D40]
repository: /Users/mateusz/grixu/cc-toolkit-collegium
branch: feat/collegium
branch-base: main
merge-after: []
worktree: /Users/mateusz/grixu/cc-toolkit-collegium.worktrees/task-prompt-wrapper
phase: 2
depends-on: [collegium-scaffold]
tickets: []
---

## Goal

`hooks/prompt.ts` writes a run's `prompt.md` (preamble plus task) and `schema.json` (the fixed
envelope, with a caller's `result` schema slotted in after the strict-mode check), and prepares a
skill run by copying and substituting its `SKILL.md`. Its schema-check and substitution tests land
with it.

## Done when

- INTEGRATION-4 row (section 8): the TEST-1 schema-check and substitution cases pass — this
  task's part. The row's TEST-2 skill run is **environment-level**, exercised in
  `release-collegium`.

## Where to look

- INTEGRATION-4 — section 4, "INTEGRATION-4: prompt wrapper and envelope".
- TEST-1 — section 4 (strict-schema check, skill substitution).
- Work item C7, plus the matching share of C12 — section 6.

## Note

Write the tests as `plugins/collegium/tests/prompt.test.ts`.
