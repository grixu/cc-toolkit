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
branch: <proposed branch name; empty for an operational task>
worktree:
phase: <phase label from the spec's phase table>
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
task. The remaining statuses — `in-progress`, `ci`, `cr`, `fixing`, `done` — belong to the
implementation flow: implementation, then build/lint/stage verification, then code review, with
`fixing` when a stage fails. They are stage-granular because a mass implementation run can be
interrupted mid-flight, and resuming needs to know which stage each task last passed.

An operational task closes its body with a `## Note` saying why no pull request exists.
