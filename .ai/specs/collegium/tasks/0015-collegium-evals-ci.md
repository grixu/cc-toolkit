---
name: Eval suite and the CI job the spike chose
status: todo
spec: ../SPEC.md
elements: [TEST-3, CICD-1, CICD-2]
decisions: [D31, D33, D63, D64, D65, D68, D75]
repository: /Users/mateusz/grixu/cc-toolkit-collegium
branch: feat/collegium
branch-base: main
merge-after: []
worktree:
phase: 3
depends-on: [ci-eval-spike, run-and-config-ui]
tickets: []
---

## Goal

`plugins/collegium/evals/` holds the two `/collegium:run` cases, and CI runs collegium: either the
eval arm in `plugin-evals.yml` (positive spike) or a new `claude plugin test` job (negative spike,
with the eval kept local).

## Done when

- UI-1 row (section 8): the TEST-3 eval meets its threshold — in CI or locally, per the spike's
  outcome; this task's row.
- CICD-1 / CICD-2 row: the merged workflow's collegium job green on PR 1 — branch-level.

## Where to look

- TEST-3 — section 4, "TEST-3: eval suite".
- CICD-1 — section 4, "CICD-1: CI eval spike and eval arm".
- CICD-2 — section 4, "CICD-2: unit-test CI job (conditional)".
- D63–D65 — section 3, decisions table (the eval arm's WIF wiring; every case's model and effort).
- Work item C16 — section 6.

## Note

Write the CI half against the G3 outcome `ci-eval-spike` records in
`.ai/specs/collegium/evidence/spikes.md`: positive → land the eval arm with TEST-3; negative → land
CICD-2 instead and leave TEST-3 local. Only one of CICD-1 and CICD-2 lands. The eval cases invoke
the `/collegium:run` skill `run-and-config-ui` ships, always with `--wait` (D75) and
`timeout_seconds: 600` as TEST-3 states. The CI pin is already 2.1.327 (D68, commit `1954c54b`);
a CICD-2 job installs that version.
