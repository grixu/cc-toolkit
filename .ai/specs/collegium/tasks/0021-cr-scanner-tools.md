---
name: Scanner tool list and the Codex-host skip
status: merged
spec: ../SPEC.md
elements: [INTEGRATION-7]
decisions: [D44]
repository: /Users/mateusz/grixu/cc-toolkit-collegium
branch: feat/code-review-codex-review
branch-base: main
merge-after: [feat/collegium]
worktree: /Users/mateusz/grixu/cc-toolkit-collegium.worktrees/task-cr-scanner-tools
phase: 4
depends-on: []
tickets: []
---

## Goal

The `code-review:scanner` agent may call the Collegium tools it needs, and code-review running
under the Codex CLI never offers or runs the Codex review.

## Done when

- The INTEGRATION-7 rows (section 8) are **environment-level**, exercised in `release-code-review`;
  whether the tool list suffices in a workflow without a prompt is gap G5, settled in `release-fd3`.
  The phase's `/verify` row is branch-level.

## Where to look

- INTEGRATION-7 — section 4, the `agents/scanner.md` and `codex/host.md` bullets.
- Gap G5 — section 12, "Declared gaps".
- Work item R6 — section 6.
