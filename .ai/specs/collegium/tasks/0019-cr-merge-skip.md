---
name: code-review merge reads the Codex skip and Tally
status: todo
spec: ../SPEC.md
elements: [INTEGRATION-7]
decisions: [D37, D41, D55]
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

`merge-contract.md` and `cr-merge` treat `codex.md` as an external review: a skip header, a
missing file or a headerless file reads as `skipped: codex — <reason>` and never as `incomplete`,
Codex stays outside `Lenses: L of A`, and a delivered run adds `External review: codex` to the
Tally.

## Done when

- The INTEGRATION-7 and INTEGRATION-7 skip rows (section 8) are **environment-level**, exercised in
  `release-code-review`. The phase's `/verify` row is branch-level.

## Where to look

- INTEGRATION-7 — section 4, the `merge-contract.md` and `cr-merge` bullet.
- D55 — section 3.
- Work item R5 — section 6.

## Note

Read the skip header and `codex.md` shape from `references/codex-review.md` (`cr-codex-reference`),
so the merge parses exactly what the reference tells the scanner to write.
