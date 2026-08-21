# Task file

The shape `split-to-tasks` writes each task in. YAML frontmatter carries the machine-readable
fields; the body carries the brief.

```markdown
---
name: <a name the user recognises the task by>
status: todo
spec: <relative path to the spec file>
elements: [DB-1, API-2]
decisions: [D2, D4]
repository: <path or name; `none` for an operational task>
branch: <target branch — shared by every task in the same landing unit; empty for an operational task>
branch-base: <the branch's stack base — identical on every task of the branch; empty for an operational task>
worktree:
phase: <rollout phase label from the spec's phase table>
depends-on: [<task slugs>]
tickets: [<identifiers, if any>]
---

## Goal

<Two or three sentences in the task's own words: what exists when this is done.>

## Done when

<The verification rows — by element code and kind — that must pass. A task with no row of its own
inherits its phase's verification, and says so.>

## Where to look

<Pointers into the spec, by element code and section heading — never by line number; lines rot.
One pointer per element, plus the decisions that constrain the work.>
```

`status` is always `todo` at split time, and `worktree` stays empty until implementation claims the
task. The remaining statuses — `in-progress`, `implemented`, `blocked`, `done` — belong to the
implementation flow: `implemented` means the code exists on the task's own branch — whether it has
reached the target branch is git's knowledge, never a status; validation runs batched per target
branch (build, lint, tests, then code review — once, never per task, so parallel tasks never race
the same tooling); `blocked` means only a human can move it; `done` comes only after the batch
passes. An interrupted mass run resumes on these: `done` is skipped, `implemented` re-enters the
merge round, where an already-merged branch no-ops.

An operational task closes its body with a `## Note` saying why no pull request exists.
