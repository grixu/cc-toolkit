# unvalidated-rollout-spec — fixture contract

This file is fixture documentation only. `reset-sandboxes.sh` excludes it from the sandbox copy.

Derived from `rollout-spec`: the same repos and the same spec, MINUS the
`### Validation pass — 2026-07-30` sub-heading in section 12 and everything under it — the verdict
line included (and `Status:` back to `draft`). The evidence record therefore shows no validation
pass, no `Verdict:` line anywhere in the file, and a fresh session holds no `fd3:validate-spec`
verdict — the split-to-tasks precondition is unmet. This fixture is the one that must never gain a
verdict line; that absence is the whole scenario.

The split-unvalidated-precondition assertions (decision, EVALS_PLAN section 6): the skill asks once whether to validate first
or split as-is; the fixture guarantees option 1 of that question is "validate first", so with
`ask_user_question: first_option` the deterministic assert is that **no task files are written**
(no `spec/tasks/` in the sandbox, no new files at all) and the output flags the missing
validation.

Do not edit the spec here directly — regenerate it from `rollout-spec` (strip the validation
sub-heading and its verdict line, flip the status line) so the two fixtures never drift.
