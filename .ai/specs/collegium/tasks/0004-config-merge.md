---
name: Read and merge the JSON configuration
status: todo
spec: ../SPEC.md
elements: [CONFIG-2, TEST-1]
decisions: [D25, D26, D27, D56, D60, D12, D47, D68]
repository: /Users/mateusz/grixu/cc-toolkit-collegium
branch: feat/collegium
branch-base: main
merge-after: []
worktree:
phase: 2
depends-on: [probe-mod-host, collegium-scaffold]
tickets: []
---

## Goal

`hooks/config.ts` reads the user and project JSON files, merges them field by field with the
project allowed only to disable a harness, computes effective enablement against the `userConfig`
flag, and fails with the file and field named on an invalid file. Its config-merge and
palette-filtering tests land with it.

## Done when

- CONFIG-2 row (section 8): the TEST-1 config-merge cases pass — this task's row.

## Where to look

- CONFIG-2 — section 4, "CONFIG-2: the JSON configuration".
- TEST-1 — section 4, "TEST-1: collegium unit tests" (config merge, palette filtering).
- D68 — section 3 (G4 settled by `probe-mod-host`, `evidence/spikes.md`).
- Work item C4, plus the matching share of C12 — section 6.

## Note

G4 is settled (D68): take the user-config path from `$.process.hookEnv()`'s `CLAUDE_PLUGIN_DATA`
and never build it by hand; there is no `$.store` fallback and no `collegium_config` tool. Write
the tests as `plugins/collegium/tests/config.test.ts`.
