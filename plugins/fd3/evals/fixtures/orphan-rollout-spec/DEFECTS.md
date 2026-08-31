# orphan-rollout-spec — fixture contract

This file is fixture documentation only. `reset-sandboxes.sh` excludes it from the sandbox copy.

Derived from `rollout-spec`: the same repos and the same spec, PLUS one planted defect —
element **API-3** (ledger entry export) is defined in section 4 with a full contract, but **no
work item in section 6 names it**. The validation sub-heading is kept, so the precondition is
satisfied and the run reaches the coverage check — which means its verdict line is kept too, with
the line count recomputed for this longer file: `spec 226 lines at this verdict` against the base
fixture's 216. A stale count fails the precondition and the run never reaches the coverage check.

The split-orphan-element assertions: the coverage check catches `API-3`, the skill stops and recommends
`fd3:validate-spec`; no task files are written; the spec file is byte-identical to this fixture
after the run (the spec is read-only for split-to-tasks).

Do not edit the spec here directly — regenerate it from `rollout-spec` (insert the API-3 block
before the API-1 heading, then `wc -l` and rewrite the verdict line's count) so the fixtures never
drift.
