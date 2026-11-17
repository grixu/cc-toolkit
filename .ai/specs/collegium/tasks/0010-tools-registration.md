---
name: Register the three Collegium tools
status: todo
spec: ../SPEC.md
elements: [API-1, API-2, API-3, TEST-1]
decisions: [D2, D11, D13, D14, D15, D20, D26, D53]
repository: /Users/mateusz/grixu/cc-toolkit-collegium
branch: feat/collegium
branch-base: main
merge-after: []
worktree:
phase: 2
depends-on: [collegium-scaffold, config-merge, codex-adapter, model-choice, prompt-wrapper, write-modes, run-lifecycle]
tickets: []
---

## Goal

`hooks/register.ts` registers `collegium_run`, `collegium_status` and `collegium_result` with the
spec's input schemas, return shapes and pre-launch errors, wires the lazy detection and the
session-start sweep, and hooks the completion notice onto the session events. Its tool-call tests
land with it.

## Done when

- API-1–3 row (section 8): the TEST-1 tool-call cases with `$.tool.call` pass — this task's part.
  The row's TEST-2 status-while-running check is **environment-level**, exercised in
  `release-collegium`.

## Where to look

- API-1 — section 4, "API-1: `mcp__collegium__collegium_run`".
- API-2 — section 4, "API-2: `mcp__collegium__collegium_status`".
- API-3 — section 4, "API-3: `mcp__collegium__collegium_result`".
- INTEGRATION-5 — the notice bullet (events registered here, per the architecture tree).
- Work item C9, plus the matching share of C12 — section 6.

## Note

`hooks/hooks.json` from `collegium-scaffold` already points at `./register.ts`, and the `codex`
toggle it reads comes from that task's manifest. The handlers call `hooks/config.ts`,
`hooks/codex.ts`, `hooks/choose.ts`, `hooks/prompt.ts`, `hooks/write.ts` and `hooks/runs.ts`. If
`probe-mod-host` recorded G4 as "not returned", this task also adds the `collegium_config` tool G4's
rule names. Write the tests as `plugins/collegium/tests/register.test.ts`.
