---
name: Run lifecycle, completion notice and sweep
status: todo
spec: ../SPEC.md
elements: [INTEGRATION-5, TEST-1]
decisions: [D15, D16, D17, D18, D19, D20, D29, D43, D57]
repository: /Users/mateusz/grixu/cc-toolkit-collegium
branch: feat/collegium
branch-base: main
merge-after: []
worktree:
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
- Gaps G1 and G2 — section 12, "Declared gaps".
- Section 7's ordering sentences.
- Work item C8, plus the matching share of C12 — section 6.

## Note

Pick the process model and the notice path from the G1 and G2 answers `probe-mod-host` records in
`.ai/specs/collegium/evidence/spikes.md`, each by its gap's rule: G1 survives → spawn, killed → the
D29 detached fallback; G2 accepted → submit at completion, refused → main-thread `turn.complete`
only. Uses the adapter's `invocation`, `parseEvent` and `finalMessage` (`hooks/codex.ts`,
`codex-adapter`), the run files `hooks/prompt.ts` writes (`prompt-wrapper`) and the before/after
steps and `conflict` outcome of `hooks/write.ts` (`write-modes`). Write the tests as
`plugins/collegium/tests/runs.test.ts`.
