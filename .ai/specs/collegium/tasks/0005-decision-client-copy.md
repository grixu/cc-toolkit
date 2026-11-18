---
name: Copy the decision client into collegium
status: done
spec: ../SPEC.md
elements: [INTEGRATION-3]
decisions: [D6, D56]
repository: /Users/mateusz/grixu/cc-toolkit-collegium
branch: feat/collegium
branch-base: main
merge-after: []
worktree: /Users/mateusz/grixu/cc-toolkit-collegium.worktrees/task-decision-client-copy
phase: 2
depends-on: []
tickets: []
---

## Goal

`plugins/collegium/hooks/decision.ts` and `hooks/providers/{index,gemini,typesafe}.ts` exist as a
fourth byte-identical copy of the decision client dev-kit, pr-proof and code-review already carry.

## Done when

- `cmp` of each of the four files against `plugins/dev-kit/hooks/` reports them equal — the
  byte-identical requirement of D6 and the "Target architecture" tree.
- INTEGRATION-3 row (section 8) is branch-level: it passes once `model-choice` lands.

## Where to look

- INTEGRATION-3 — section 4, "INTEGRATION-3: model and effort choice" (the backend step).
- Target architecture tree — section 4, the `hooks/decision.ts` line.
- D6 — section 3.
- Work item C3 — section 6.

## Note

Copy byte for byte, comment header included: the header naming three plugins is an open
non-blocking finding of the validation passes, and fixing it means editing all four copies, which
this spec does not ask for.
