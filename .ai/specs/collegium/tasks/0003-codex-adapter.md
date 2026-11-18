---
name: Harness adapter contract and the Codex adapter
status: merged
spec: ../SPEC.md
elements: [INTEGRATION-1, INTEGRATION-2, TEST-1]
decisions: [D8, D10, D13, D33, D46, D47, D7, D63, D64]
repository: /Users/mateusz/grixu/cc-toolkit-collegium
branch: feat/collegium
branch-base: main
merge-after: []
worktree: /Users/mateusz/grixu/cc-toolkit-collegium.worktrees/task-codex-adapter
phase: 2
depends-on: [collegium-scaffold]
tickets: []
---

## Goal

`hooks/harness.ts` holds the harness-adapter contract and `hooks/codex.ts` implements it for
Codex: detection, the catalogue as an `openai` palette, the login check, the invocation argv, event
parsing and the final message — plus `prepare`, which runs the CI path: the per-run workload
identity federation exchange and login. The tests for argv, event parsing and the CI path land
with it.

## Done when

- INTEGRATION-1, INTEGRATION-2 row (section 8): the TEST-1 argv, event-parse and CI-path cases pass —
  this task's part. The row's TEST-2 live read-only run is **environment-level** (real Codex on
  the author's machine), exercised in `release-collegium`.

## Where to look

- INTEGRATION-1 — section 4, "INTEGRATION-1: harness adapter contract".
- INTEGRATION-2 — section 4, "INTEGRATION-2: Codex adapter".
- TEST-1 — section 4, "TEST-1: collegium unit tests" (Codex argv, the CI path with stubbed
  `http.fetch` and a token-free failure message, event parsing incl. warning-not-failure).
- D63, D64 — section 3, decisions table.
- Risks K1, K6–K8 — section 3, "Risks accepted".
- Work item C5, plus the matching share of C12 — section 6.

## Note

Builds on the scaffold's `plugins/collegium/` manifest, which `claude plugin test` needs. Write the
tests as `plugins/collegium/tests/codex.test.ts` (or `harness.test.ts`): TEST-1 is split by module
across the phase-2 tasks.
