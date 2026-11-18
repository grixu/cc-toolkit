---
name: Remove the WIF CI path from the Codex adapter
status: done
spec: ../SPEC.md
elements: [INTEGRATION-2, TEST-1, CICD-2]
decisions: [D77, D78]
repository: /Users/mateusz/grixu/cc-toolkit-collegium
branch: feat/collegium
branch-base: main
merge-after: []
worktree: /Users/mateusz/grixu/cc-toolkit-collegium.worktrees/task-remove-wif-path
phase: 3
depends-on: [codex-adapter]
tickets: []
---

## Goal

The Codex adapter no longer carries the OpenAI workload identity federation path that only the
dropped CI eval would have called: `prepare` returns `{}`, and the code and tests behind the CI path
are gone.

## Done when

- INTEGRATION-2 (C17) row (section 8): the `grep` finds no `EVAL_*` read and no token-exchange URL in
  `hooks/codex.ts`, and the TEST-1 `prepare` case passes — this task's row.
- CICD-2 row: the `lint.yml` mod-test step is green for `plugins/collegium/` on PR 1 —
  branch-level.

## Where to look

- Work item C17 — section 6 (the files and line ranges it removes).
- D77, D78 — section 3, decisions table.
- INTEGRATION-1 (`prepare`, `RunSpec.env`) and INTEGRATION-2 — section 4.
- TEST-1 — section 4, the `prepare` case.

## Note

Edit `plugins/collegium/hooks/codex.ts` and `plugins/collegium/tests/codex.test.ts`, which
`codex-adapter` wrote. Keep `prepare` and `RunSpec.env` in the adapter contract (D78): only the CI
path inside the Codex adapter goes. The import on `codex.ts:1` is used only by that path.
