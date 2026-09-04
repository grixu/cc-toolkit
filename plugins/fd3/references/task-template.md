# Task file

The shape `split-to-tasks` writes each task in. YAML frontmatter carries the machine-readable
fields; the body carries the brief.

```markdown
---
name: <a name the user recognises the task by>
status: todo
spec: <relative path to the spec file>
elements: [DB-1, API-2]
decisions: [<the decision ids this task is bound by, if any — pointers, never copies>]
repository: <absolute path of the checkout this task is implemented in; `none` for an operational task>
branch: <target branch — shared by every task in the same landing unit; empty for an operational task>
branch-base: <the branch's stack base — identical on every task of the branch; empty for an operational task>
worktree:
phase: <rollout phase label from the spec's phase table; `cleanup` for a cleanup-section task — it sorts after every numbered phase>
depends-on: [<task slugs>]
tickets: [<identifiers, if any>]
---

## Goal

<Two or three sentences in the task's own words: what exists when this is done.>

## Done when

<The verification rows — by element code and kind — that must pass. Name the row, never restate
its expected values or counts: the implementing agent reads the row in the spec, and a copied
number is a second source of truth that rots. A task with no row of its own inherits its phase's
verification, and says so. A row that only passes once the whole branch or phase is in place is
named as that — the spec's row says where it runs — not as this task's criterion: validation is
batched per target branch, so no single task is asked to make one pass on its own. A row that
cannot pass from a branch at all — it needs a deployed environment, live data, or a human
`terraform apply` or console action — is named as **environment-level**, together with the
operational task or rollout gate that will exercise it. The implementing agent must be able to
tell "not yet true" from "not checkable here".>

## Where to look

<Pointers into the spec, by element code and section heading — never by line number; lines rot.
One pointer per element, plus the decisions that constrain the work.>
```

The ordinal prefix lives only in the filename. `depends-on` and every cross-reference in the
body carry the bare slug, so a regeneration may renumber freely without breaking a reference.

`status` is always `todo` at split time, and `worktree` stays empty until implementation claims the
task. The remaining statuses — `in-progress`, `implemented`, `merged`, `blocked`, `done` — belong to the
implementation flow: `implemented` means the code exists on the task's own branch; `merged` means
that branch has reached the target branch, which is now waiting on validation — batched per target
branch (build, lint, tests, then code review — once, never per task, so parallel tasks never race
the same tooling); `blocked` means only a human can move it; `done` comes only after that batch
passes its final gate. Which of the two a file records is a report of what happened, never the
authority on it: whether a branch reached its target is git's knowledge, and an interrupted run
re-derives it. `done` is skipped on resume; `implemented` and `merged` both re-enter the merge
round, where an already-merged branch no-ops.

Any task may close with a `## Note` carrying what no other section does — a spec conflict the
split resolved and how, a repository convention the work must respect, a standing manual step.
For an operational task the note is mandatory: it says why no pull request exists and, when its
output is a file that must land in a repository, the branch it lands on.
