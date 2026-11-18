# implement-tasks answers — collegium

- Start ref (/Users/mateusz/grixu/cc-toolkit-collegium): `origin/main`; diff base `origin/main`;
  `feat/collegium` is the parked checkout, reused as PR 1's branch (split report, Q1 there).
- Review: yes (2026-11-17).
- Commit: spec, split report and tasks committed on `feat/collegium` (e29f7265) before launch.
- Merge-up: `origin/main` (28b8dde9) merged into `feat/collegium` (71363b70) before launch.
- Consents: none asked for by any task Note.

## Decisions (report round 1, 2026-11-17)

- Q4 probes G1/G2/G4: later — park the run after the repair.
- Q5 ShellCheck red on feat/collegium and feat/fd3-codex-review (cytoscape scripts under node_modules, not the branches): accept as known failure.
- Q6 Collegium hook tests failing under the real `claude plugin test`: repair now on feat/collegium.
- Q7 spec drift (finalMessage($, runDir) async, Tally clause `External review: skipped: codex — …`, no codex entry under never/ask-No, headless `choice` gap): keep code, amend spec via `/fd3:build-spec .ai/specs/collegium/SPEC.md`.

## Decisions (probes, 2026-11-18)

- Q8 G4 split (`$.process.hookEnv()` exists from 2.1.326, absent on 2.1.322/.323/.325): Collegium requires Claude Code ≥ 2.1.327 and the CI pin `plugin-evals.yml` `CLAUDE_CODE_VERSION` goes to 2.1.327; CONFIG-2 stays as written (`${CLAUDE_PLUGIN_DATA}/config.json` from `hookEnv()`), no `$.store` fallback. Spec amendment via `/fd3:build-spec`.
- Q9 G3 negative (2026-11-18, `evidence/spikes.md` G3; inside `claude plugin eval` the mod gets only manifest-default options, so `codex` is false, and `$.http.fetch` is refused): no eval suite. TEST-3 and the CI eval arm are dropped; `/collegium:run` is checked by the live-check script (TEST-2); CICD-2 is already met by `lint.yml:54-57`. Spec amendment via `/fd3:build-spec`.

## Relaunch (2026-11-18)

- Merge-up: `origin/main` (dd387afe) merged into `feat/collegium` (573226e0) before the relaunch, under the standing merge-up answer; no conflicts.
- Tasks re-pointed at D66–D76 (1a8bade3) before the relaunch.

## Re-split relaunch (2026-11-18)

- Re-split by `/fd3:split-to-tasks` (3f33aad3); the user chose Replace, so every task restarted at `todo`. `probe-mod-host` set back to `done` from `evidence/spikes.md` (b7dc87bf, 6dff3e9b).
- Merge-up: `origin/main` (7b8aa779) merged into `feat/collegium` (91304a13), standing answer, no conflicts.

## P4 relaunch (2026-11-18)

- Spec amended for P4 (D77, D78; 5d49c2ec), tasks updated in place (586744ae): `remove-wif-path` (C17) replaces the eval task.
- Merge-up: `origin/main` (2ee20d08) merged into `feat/collegium` (04c37b5e), standing answer, no conflicts.
- Stale `node_modules` removed from the code-review and fd3 branch worktrees so their local ShellCheck matches CI's fresh checkout (Q5 cause).

Repairs: /Users/mateusz/grixu/cc-toolkit-collegium feat/collegium: 1

Last report: /private/tmp/claude-501/-Users-mateusz-grixu-cc-toolkit-collegium/9012e0f3-8518-4efc-b7ea-c46b0dc4d3cf/tasks/wqh97jc1i.output (implement, 2026-11-18)
Last report: /private/tmp/claude-501/-Users-mateusz-grixu-cc-toolkit-collegium/9012e0f3-8518-4efc-b7ea-c46b0dc4d3cf/tasks/wl4guemqi.output (repair, 2026-11-18)
