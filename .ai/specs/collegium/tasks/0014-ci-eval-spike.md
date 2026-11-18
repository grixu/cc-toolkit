---
name: CI eval spike (G3)
status: done
spec: ../SPEC.md
elements: [CICD-1]
decisions: [D33, D63, D64]
repository: none
branch:
branch-base:
merge-after: []
worktree:
phase: 3
depends-on: [run-and-config-ui]
tickets: []
---

## Goal

A throwaway branch proves or disproves that a mod inside `claude plugin eval` in CI can
authenticate Codex through OpenAI workload identity federation and that Codex reaches the network
from there — the G3 question — and the outcome is recorded.

## Done when

- CICD-1 / CICD-2 row (section 8): the spike run — this task's part; the outcome (positive or
  negative per CICD-1's outcome rule) is recorded in `evidence/spikes.md`.
- The spike branch is deleted after the outcome is recorded (section 9, "Cleanup").

## Where to look

- CICD-1 — section 4, "CICD-1: CI eval spike and eval arm".
- D63, D64 — section 3, decisions table.
- Gap G3 and risks K4, K6–K8 — section 12, "Declared gaps"; section 3, "Risks accepted".
- Prerequisites table — section 4 (the WIF provider, mapping and Actions variables, met).
- Work item C15 — section 6; section 9 for the branch deletion.

## Note

No pull request exists: the spike lives on a throwaway branch that is never merged, and its output
is a recorded outcome. It needs a CI run, which no implementation worktree can start. The spike branch is cut from
`feat/collegium` once the plugin and `/collegium:run` exist there. Record the outcome in
`.ai/specs/collegium/evidence/spikes.md`, which lands on `feat/collegium`. What has to come back,
from the spec team (Mateusz Gostański): the G3 outcome. It came back negative (D77): no eval suite
and no new job, and the WIF path is removed by `remove-wif-path`.
