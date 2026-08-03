# orphan-rollout-spec — fixture contract

This file is fixture documentation only. `reset-sandboxes.sh` excludes it from the sandbox copy.

Derived from `rollout-spec`: the same repos and the same spec, PLUS one planted defect —
element **API-3** (ledger entry export) is defined in section 4 with a full contract, but **no
work item in section 6 names it**. The validation sub-heading is kept, so the precondition is
satisfied and the run reaches the coverage check.

The split-orphan-element assertions: the coverage check catches `API-3`, the skill stops and recommends
`fd3:validate-spec`; no task files are written; the spec file is byte-identical to this fixture
after the run (the spec is read-only for split-to-tasks).

Do not edit the spec here directly — regenerate it from `rollout-spec` (insert the API-3 block
before the API-1 heading) so the fixtures never drift.
