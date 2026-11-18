---
name: Run lifecycle, completion notice and sweep
status: done
spec: ../SPEC.md
elements: [INTEGRATION-5, TEST-1]
decisions: [D15, D16, D17, D18, D19, D20, D29, D43, D57, D66, D67, D69, D76]
repository: /Users/mateusz/grixu/cc-toolkit-collegium
branch: feat/collegium
branch-base: main
merge-after: []
worktree: /Users/mateusz/grixu/cc-toolkit-collegium.worktrees/task-run-lifecycle
phase: 2
depends-on: [probe-mod-host, collegium-scaffold, codex-adapter, prompt-wrapper, write-modes]
tickets: []
---

## Goal

`hooks/runs.ts` creates the run directory, starts Codex without awaiting it, keeps `state.json` as
the source of truth through every state including `timeout` and `conflict`, queues the completion
notice, and sweeps dead runs at a session's first call. Its state-transition and sweep tests land
with it.

## Done when

- INTEGRATION-5 row (section 8): the TEST-1 state and sweep cases pass — this task's part. The
  row's observed-only `timeout` run in TEST-2 is **environment-level**, exercised in
  `release-collegium`.

## Where to look

- INTEGRATION-5 — section 4, "INTEGRATION-5: run lifecycle".
- TEST-1 — section 4 (state transitions, sweep).
- D66, D67, D76 — section 3 (G1 and G2 settled by `probe-mod-host`, `evidence/spikes.md`).
- Section 7's ordering sentences.
- Work item C8, plus the matching share of C12 — section 6.

## Note

G1 and G2 are settled: the process is `$.process.spawn` only, with no detached fallback (D66); the
notice is submitted at completion through the `$` of the handler that started the run, a dropped or
rejected submit falls back to the main-thread `turn.complete` notice, and each run is notified once
(D67); only runs whose `collegium_run` call came from the main loop are notified (D76) — TEST-1
gains the dropped-submit and subagent-run cases INTEGRATION-5 and TEST-1 name. `$` cannot be kept
in a variable (`claude plugin validate` refuses it). Uses the adapter's `invocation`, `parseEvent` and `finalMessage` (`hooks/codex.ts`,
`codex-adapter`), the run files `hooks/prompt.ts` writes (`prompt-wrapper`) and the before/after
steps and `conflict` outcome of `hooks/write.ts` (`write-modes`). Write the tests as
`plugins/collegium/tests/runs.test.ts`.
