---
name: code-review docs, ADR 0005 and CHANGELOG
status: todo
spec: ../SPEC.md
elements: [DOCS-2]
decisions: [D35, D36, D37, D38, D41, D52, D55]
repository: /Users/mateusz/grixu/cc-toolkit-collegium
branch: feat/code-review-codex-review
branch-base: main
merge-after: [feat/collegium]
worktree:
phase: 4
depends-on: [cr-collegium-option, cr-merge-skip, cr-scan-prepare-codex, cr-scanner-tools, cr-start-cr-codex]
tickets: []
---

## Goal

code-review's README has a "Codex review (external)" section, `CONTEXT.md` defines "External
review", ADR 0005 records the decisions behind the Codex review, and the CHANGELOG's
`[Unreleased]` lists the change.

## Done when

- DOCS-1–3 row (section 8), code-review part: `/verify` clean — this task's row.

## Where to look

- DOCS-2 — section 4, "DOCS-2: code-review documentation".
- The decisions the ADR records — section 3.
- Work item R7 — section 6.

## Note

Describes what the other phase-4 tasks build: the option (`cr-collegium-option`), the merge
semantics (`cr-merge-skip`), the headless path (`cr-scan-prepare-codex`), the scanner tools
(`cr-scanner-tools`) and `/start-cr` (`cr-start-cr-codex`).
