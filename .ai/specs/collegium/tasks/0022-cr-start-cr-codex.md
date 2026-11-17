---
name: /start-cr decides and dispatches the Codex review
status: todo
spec: ../SPEC.md
elements: [INTEGRATION-7]
decisions: [D35, D37, D38, D45, D49, D52]
repository: /Users/mateusz/grixu/cc-toolkit-collegium
branch: feat/code-review-codex-review
branch-base: main
merge-after: [feat/collegium]
worktree:
phase: 4
depends-on: [cr-codex-reference, cr-collegium-option]
tickets: []
---

## Goal

`/start-cr` decides in Step 2b whether the Codex review runs, writes the `codex` entry, dispatches
it in Step 3 as one more unnamed scanner, exempts it from the fail-closed menu, and grants the
Collegium tools in its `allowed-tools`.

## Done when

- The INTEGRATION-7 and INTEGRATION-7 skip rows (section 8) are **environment-level**, exercised in
  `release-code-review`. The phase's `/verify` row is branch-level.

## Where to look

- INTEGRATION-7 — section 4, the `/start-cr` bullet.
- Section 1, "Header and precedence" — the input-gated and fail-closed rules this amends.
- Work item R4 — section 6.

## Note

Step 2b's decision follows `references/codex-review.md` (`cr-codex-reference`) and reads
`${user_config.collegium_run}`, the option `cr-collegium-option` adds; an unset (literal) value is
`ask` (D45).
