---
name: Write modes (worktree, branch, merge)
status: done
spec: ../SPEC.md
elements: [INTEGRATION-6, TEST-1]
decisions: [D3, D24, D39, D50, D61]
repository: /Users/mateusz/grixu/cc-toolkit-collegium
branch: feat/collegium
branch-base: main
merge-after: []
worktree: /Users/mateusz/grixu/cc-toolkit-collegium.worktrees/task-write-modes
phase: 2
depends-on: [collegium-scaffold]
tickets: []
---

## Goal

`hooks/write.ts` prepares a write-mode run's worktree before Codex starts and, after it exits,
commits, reports the diffstat, removes the worktree and, in `merge` mode, merges into the caller's
branch or reports `conflict` — per mode, as the spec's table sets out. Its git-sequence tests land
with it.

## Done when

- INTEGRATION-6 row (section 8): the TEST-1 git-sequence cases pass — this task's part. The row's
  TEST-2 `branch` run in a scratch repository is **environment-level**, exercised in
  `release-collegium`.

## Where to look

- INTEGRATION-6 — section 4, "INTEGRATION-6: write modes".
- TEST-1 — section 4 (write-mode git sequences).
- Risk K5 — section 3, "Risks accepted".
- Section 7's ordering sentence: write modes are written before the run lifecycle and the tools.
- Work item C10, plus the matching share of C12 — section 6.

## Note

Never pass a flag that bypasses signing or hooks: commits use the user's git configuration as it
is (D61). Write the tests as `plugins/collegium/tests/write.test.ts`.
