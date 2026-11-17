---
name: Probe claude plugin configure --json (G6)
status: todo
spec: ../SPEC.md
elements: []
decisions: [D54]
repository: none
branch:
branch-base:
merge-after: []
worktree:
phase: 5
depends-on: [release-code-review]
tickets: []
---

## Goal

It is known whether `claude plugin configure code-review --json` prints the saved `collegium_run`
on the installed Claude Code version.

## Done when

This task inherits phase 5's verification and has no row of its own: gap G6's answer is recorded
as yes or no in `evidence/spikes.md`.

## Where to look

- Gap G6 — section 12, "Declared gaps".
- D54 — section 3.
- INTEGRATION-8 — section 4, the `implement-tasks` step-2 bullet.

## Note

No pull request exists: this is a hand-run probe against the installed code-review release (it
needs `collegium_run` saved through `/plugin configure code-review`, which exists only after
`release-code-review`). Record the answer in `.ai/specs/collegium/evidence/spikes.md`, committed
where the spec lives. What has to come back, from the spec team (Mateusz Gostański): whether the
saved value is printed — `fd3-step2-question` is written against it.
