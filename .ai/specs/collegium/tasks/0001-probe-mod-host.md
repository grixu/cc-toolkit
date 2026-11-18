---
name: Phase-1 probes of the mod host (G1, G2, G4)
status: done
spec: ../SPEC.md
elements: [TEST-5]
decisions: [D16, D29, D43, D27]
repository: none
branch:
branch-base:
merge-after: []
worktree:
phase: 1
depends-on: []
tickets: []
---

## Goal

The three open host facts behind the run lifecycle and the config location are answered by live
probes in an interactive Claude Code session and recorded as yes or no: whether an un-awaited
spawn survives its handler's return and a user Stop (and whether the D29 fallback's detached child
survives its `$.process.run`), whether `$.prompt.submit` is accepted after the handler returned,
and whether `$.process.hookEnv()` returns `CLAUDE_PLUGIN_DATA`.

## Done when

- TEST-5 row (section 8): each of G1, G2, G4 recorded in `evidence/spikes.md`. This is the
  task's own row, run by hand on the author's machine.

## Where to look

- TEST-5 — section 4, "TEST-5: phase-1 probes".
- Declared gaps G1, G2, G4 — section 12, "Declared gaps": each row's rule says which design follows
  from which answer.
- Work item C1 — section 6, `plugins/collegium` table.
- D16, D29, D43 for the process and notice model; D27 and CONFIG-2 for the config location.

## Note

No pull request exists: these are hand-run probes against a live interactive session (one of
them needs a human to press Stop), and their only output is the evidence file. Write the result to
`.ai/specs/collegium/evidence/spikes.md` beside the spec; it lands on `feat/collegium`, where the
spec lives. What has to come back, from the spec team (Mateusz Gostański): a yes or no for each of
G1, G2 and G4 — `run-lifecycle` is written against the G1 and G2 answers and `config-merge`
against the G4 answer, each following the rule in its gap's row.
