---
name: Manual live-check script
status: todo
spec: ../SPEC.md
elements: [TEST-2]
decisions: [D31, D75]
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

`plugins/collegium/scripts/live-check.sh` drives `claude -p` with the plugin loaded against real
Codex for a read-only run, a `branch` run in a scratch repository and a skill run, printing each
run's state and envelope.

## Done when

- The script is shellcheck-clean — branch-level, the repository's lint workflow runs shellcheck on
  every `*.sh`.
- The TEST-2 parts of the INTEGRATION-1/2, -3, -4, -5, -6 and API-1–3 rows (section 8) are
  **environment-level**: they need real, logged-in Codex enabled on the author's machine, and
  `release-collegium` runs the script.

## Where to look

- TEST-2 — section 4, "TEST-2: manual live script".
- Section 8 rows that name TEST-2.
- Work item C13 — section 6.

## Note

Calls the tools `tools-registration` registers, by the names API-1–3 give them. Runs that go
through `/collegium:run` pass `--wait` (D75): a `claude -p` session ends with its turn, so without
it no envelope comes back. Give the section 8 INTEGRATION-5 `timeout` run (`timeout_minutes: 1`) a
route — `/collegium:run --wait` has no timeout flag, so call `collegium_run` directly for it.
