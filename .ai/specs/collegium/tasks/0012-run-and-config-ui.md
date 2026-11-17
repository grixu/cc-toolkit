---
name: /collegium:run skill and /collegium:config command
status: todo
spec: ../SPEC.md
elements: [UI-1, UI-2]
decisions: [D14, D26, D28, D47, D58]
repository: /Users/mateusz/grixu/cc-toolkit-collegium
branch: feat/collegium
branch-base: main
merge-after: []
worktree:
phase: 2
depends-on: [tools-registration]
tickets: []
---

## Goal

A user can launch a run with `/collegium:run`, which prints the run id and chosen model and effort,
ends its turn and shows the envelope on the completion notice; and can write the user or project
config through `/collegium:config`.

## Done when

- UI-1 row (section 8): the TEST-3 eval — branch-level, it passes once `collegium-evals-ci` lands.
- UI-2 row: the triggered `/collegium:config` run is **environment-level** (author's machine),
  exercised in `release-collegium`.

## Where to look

- UI-1 — section 4, "UI-1: `/collegium:run` skill".
- UI-2 — section 4, "UI-2: `/collegium:config` command".
- CONFIG-2 — the file shapes the command writes.
- Work item C11 — section 6.

## Note

The skill's `allowed-tools` names the tools `tools-registration` registers. If `probe-mod-host`
recorded G4 as "not returned", `/collegium:config` writes the user config through the
`collegium_config` tool instead of `Write`, per G4's rule.
