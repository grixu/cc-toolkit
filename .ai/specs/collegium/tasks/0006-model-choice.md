---
name: Model and effort choice
status: todo
spec: ../SPEC.md
elements: [INTEGRATION-3, TEST-1]
decisions: [D5, D6, D7, D12, D47, D48, D56, D59]
repository: /Users/mateusz/grixu/cc-toolkit-collegium
branch: feat/collegium
branch-base: main
merge-after: []
worktree:
phase: 2
depends-on: [collegium-scaffold, decision-client-copy, config-merge, codex-adapter]
tickets: []
---

## Goal

`hooks/choose.ts` turns the effective palette, the tier map and the caller's model and effort into
a validated model and effort, asking the decision backend only for what is missing and falling
back to Haiku, then to Codex's defaults, as the spec lays out. It reports which backend chose and
where each value came from. Its choice-path tests land with it.

## Done when

- INTEGRATION-3 row (section 8): the TEST-1 choice cases pass — this task's part. The row's TEST-2
  `chosenBy` print is **environment-level**, exercised in `release-collegium`.

## Where to look

- INTEGRATION-3 — section 4, "INTEGRATION-3: model and effort choice".
- TEST-1 — section 4 (choice paths).
- Work item C6, plus the matching share of C12 — section 6.

## Note

Uses the copied client in `hooks/decision.ts` and `hooks/providers/` (`decision-client-copy`) —
call it, never edit it. Reads the merged tiers, exclusions and `decision.backend` from
`hooks/config.ts` (`config-merge`) and the `Palette`/`Model` types and catalogue from
`hooks/harness.ts` and `hooks/codex.ts` (`codex-adapter`). Write the tests as
`plugins/collegium/tests/choose.test.ts`.
