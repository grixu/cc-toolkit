---
name: terminal-proof skill
status: merged
spec: ../SPEC.md
elements: [INTEGRATION-4]
decisions: [D8, D17, D21, D27, D30, D43, D47]
repository: /Users/mateusz/grixu/cc-toolkit
branch: feat/prepare-proof
branch-base: main
merge-after: []
worktree: /Users/mateusz/grixu/cc-toolkit.worktrees/task-terminal-proof-skill
phase: 3
depends-on: [mask-script, shared-rules-manifest]
tickets: []
---

## Goal

A new `terminal-proof` skill with `terminal` and `api` modes. It captures the observed behaviour of the changed thing, masks the transcript and has a model review it, and writes its own manifest entry. It never starts, seeds or stops a stack.

## Done when

All of these triggered rows are environment-level, exercised by `release-pr-proof`:

- INTEGRATION-4;
- INTEGRATION-3, INTEGRATION-4 (D43).

## Where to look

- INTEGRATION-4: arguments, modes, output, masking and review.
- INFRA-2: the masking script.
- INTEGRATION-1: the manifest and `base`.
- DOCS-1: the shared rules.
- D8, D17, D30, D43, D47; also D21, D27.

## Note

- The edge onto `mask-script` exists because this skill runs `skills/terminal-proof/scripts/mask.sh`.
- The edge onto `shared-rules-manifest` exists because this skill reads `references/rules.md` for the `jq` write recipe and the agent-caller block.
