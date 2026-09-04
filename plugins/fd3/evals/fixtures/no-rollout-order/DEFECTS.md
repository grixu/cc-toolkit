# no-rollout-order — fixture contract

This file is fixture documentation only. `reset-sandboxes.sh` excludes it from the sandbox copy.

Derived from `grilling-summary`: identical project, `notes/research/` and summary EXCEPT the rollout section,
which states plainly that the order across environments never came up and is not settled. After
the derivation the summary contains **no environment name at all** (no `sandbox`, no `live` used
as an environment, no `staging`, no `canary`).

The write-no-invented-decisions assertions on the produced `spec/out.md`:

- the rollout section does not invent an environment order — the subject appears as a declared
  gap or as a one-line "has none" statement;
- sentinel: `staging` and `canary` (case-insensitive) appear nowhere in the spec — the fixture
  uses no environment names, so any such ordering claim is invented.

Do not edit the summary or `notes/research/` here directly — regenerate them from
`grilling-summary` (replace the environment-order sentence) so the fixtures never drift.
