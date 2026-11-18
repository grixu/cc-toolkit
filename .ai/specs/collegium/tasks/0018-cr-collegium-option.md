---
name: code-review collegium_run option
status: merged
spec: ../SPEC.md
elements: [CONFIG-3]
decisions: [D38, D45]
repository: /Users/mateusz/grixu/cc-toolkit-collegium
branch: feat/code-review-codex-review
branch-base: main
merge-after: [feat/collegium]
worktree: /Users/mateusz/grixu/cc-toolkit-collegium.worktrees/task-cr-collegium-option
phase: 4
depends-on: []
tickets: []
---

## Goal

code-review's manifest carries the `collegium_run` `userConfig` option with `always`, `never` and
`ask`.

## Done when

- `claude plugin validate plugins/code-review/ --strict` stays valid — the phase's `/verify` row
  (DOCS-1–3), branch-level.
- The CONFIG-3, INTEGRATION-7 row (section 8) is **environment-level**, exercised in
  `release-code-review`.

## Where to look

- CONFIG-3 — section 4, "CONFIG-3: code-review `collegium_run`".
- Work item R1 — section 6.

## Note

Edit only the `userConfig` block; never touch the `version` in `.claude-plugin/plugin.json` or
`.codex-plugin/plugin.json` — `release.sh` bumps both (repository `CLAUDE.md`).
