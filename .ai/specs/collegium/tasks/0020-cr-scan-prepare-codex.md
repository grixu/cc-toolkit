---
name: cr-scan --lens codex and cr-prepare --codex
status: todo
spec: ../SPEC.md
elements: [INTEGRATION-7]
decisions: [D36, D42, D44, D52, D53]
repository: /Users/mateusz/grixu/cc-toolkit-collegium
branch: feat/code-review-codex-review
branch-base: main
merge-after: [feat/collegium]
worktree:
phase: 4
depends-on: [cr-codex-reference]
tickets: []
---

## Goal

`cr-prepare --codex` adds the `codex` entry to `lenses.active`, and `cr-scan --lens codex` follows
the Codex review reference: it calls `collegium_run`, waits with `collegium_result` until a
terminal state, and writes `codex.md`. `cr-scan`'s `allowed-tools` grants the tools it calls.

## Done when

- The INTEGRATION-7 rows (section 8) are **environment-level**, exercised in `release-code-review`.
  The phase's `/verify` row is branch-level.

## Where to look

- INTEGRATION-7 — section 4, the `cr-scan --lens codex` and `cr-prepare --codex` bullets.
- API-1 and API-3 — section 4, the tool inputs and the 600 s wait.
- Work item R3 — section 6.

## Note

`cr-scan --lens codex` follows `references/codex-review.md` (`cr-codex-reference`) — point at it,
don't restate it in the skill.
