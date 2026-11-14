---
name: screenshot-proof skill
status: merged
spec: ../SPEC.md
elements: [INTEGRATION-3]
decisions: [D18, D19, D20, D21, D31, D39, D43, D44, D47, D50]
repository: /Users/mateusz/grixu/cc-toolkit
branch: feat/prepare-proof
branch-base: main
merge-after: []
worktree: /Users/mateusz/grixu/cc-toolkit.worktrees/task-screenshot-proof-skill
phase: 3
depends-on: [shared-rules-manifest]
tickets: []
---

## Goal

A new `screenshot-proof` skill shoots the changed screens at the resolved widths from the URLs it is given, optionally adding before shots from a base URL. It has each shot approved and writes its own manifest entry. It never starts, seeds or stops a stack.

## Done when

All of these triggered rows are environment-level, exercised by `release-pr-proof`:

- INTEGRATION-3;
- INTEGRATION-3, INTEGRATION-4 (D43);
- the D44 rows that name INTEGRATION-3 (URL, no base);
- CONFIG-1 (D50).

## Where to look

- INTEGRATION-3: arguments, inputs, widths, tool choice, output, before shots, approval, `files` and the entry.
- INTEGRATION-1: the manifest and `base`.
- DOCS-1: the shared rules it reads.
- D43, D44, D47, D50; also D18, D19, D20, D21, D31, D39.

## Note

- The edge onto `shared-rules-manifest` exists because this skill reads `references/rules.md` for the `jq` write recipe, the approval rule and the agent-caller block.
