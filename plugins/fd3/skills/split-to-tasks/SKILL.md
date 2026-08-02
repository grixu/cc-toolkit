---
name: split-to-tasks
description: Split a spec into task files — one task per branch, worktree and pull request, cut along repository and ownership boundaries, sized for review, ordered by rollout phase and dependency. Use when the user wants a SPEC divided into implementable tasks.
argument-hint: "<path to the spec file>"
---

The spec to split: **$ARGUMENTS**

If no path was given, ask which spec to split. If the path does not resolve, say so and stop.

The spec is read-only here. A defect you find in it — an element no work item builds, a work item
that cites nothing — is a reason to recommend `fd3:validate-spec`, never something to fix in
passing.

## Terms

- **Task** — the smallest set of the spec's work items that is independently verifiable and leaves
  its repository mergeable. **One task = one branch = one worktree = one pull request.** That is an
  identity, not a guideline: work that cannot land as one pull request is more than one task, and
  work whose pull request would not build on its own is less than one.
- **Operational task** — the one sanctioned exception to that identity: work done by hand against
  the live system (a `gcloud` sequence, a console action) with no pull request. It exists only when
  the spec names a gate that other tasks depend on and no repository carries it. Its frontmatter
  says `repository: none` and leaves `branch` empty — these fields are machine-read, so prose in
  them breaks the reader — and its body closes with a `## Note` saying why no pull request exists.
- **The index card rule** — a task file carries pointers, never copies. The spec stays the single
  source of truth. Contract prose copied into a task is a second source of truth that rots
  silently, because nothing detects that the spec moved on.

## Precondition

Splitting propagates the spec's defects into every task. If this conversation holds no
`fd3:validate-spec` verdict for the spec, and its evidence record shows no validation pass, say so
and ask — once — whether to validate first or split as-is.

## Workflow

Post this checklist before your first tool call, and post it again with the marks updated each time
a step completes — it is how the user sees progress:

```
- [ ] 1. Enumerate: work items, element codes, phases, ownership, tickets
- [ ] 2. Cut along the boundaries
- [ ] 3. Order by phase and dependency
- [ ] 4. Check coverage
- [ ] 5. Put the judgment calls to the user, in one batch
- [ ] 6. Write the task files and report
```

### 1. Enumerate

Read the spec in full. List every work item from the per-repository section with the element codes
it names, every rollout phase, the ownership table, and the ticket identifiers. A fact the spec
does not give you — a repository's branch naming convention, the plausible blast radius of an item
— is yours to look up yourself: a direct command for a specific fact (`git branch -r`, a tracker
query), `Explore` dispatched into the repository when finding it takes searching, following the
dispatch rules in `${CLAUDE_SKILL_DIR}/../../references/fact-routes.md`. Never ask the user what
you can read.

### 2. Cut

The raw material is the work items. Every task is a subset of them, and every item lands in exactly
one task. Apply the boundaries in order — each is a rule with a reason, and the reason decides the
edge cases:

1. **A repository always cuts.** One task = one branch = one pull request, and two repositories
   cannot share a branch. This holds even when one team owns both repositories.
2. **Inside a monorepo, ownership cuts.** The unit is a subtree with one review-and-apply owner —
   the spec's ownership section says whose. A task whose pull request needs two teams' approval is
   two tasks.
3. **A rollout phase cuts.** A task belongs to one phase; an item set spanning two phases is two
   tasks, ordered.
4. **Irreversibility cuts, and moves to the front.** An element whose change is irreversible or
   contends for a shared environment — a database migration is the canonical case — gets its own
   task, placed as early as its dependencies allow, so it lands on the main branch before anything
   queues up behind the environment. Expand early; the contracting half lives in the spec's cleanup
   section and becomes its own late task, behind the gate the spec names.
5. **Review size cuts.** Split further when a task would plausibly exceed **80 changed files or
   2000 changed lines**, generated files excluded — past that size a reviewer stops reading and
   starts skimming, and the review approves the shape of the change rather than the change.
   Estimate from the items' citations, and put a genuine doubt in the step-5 batch. These are
   defaults the user can override, and they are policy of this skill — they never appear in the
   spec.

Within what survives the boundaries, prefer the smallest task that makes one verification row
pass. Where one repository owns a whole behaviour, that yields a vertical slice — schema, endpoint
and UI landing together. Where ownership or rollout forbids it, it degrades honestly into
phase-ordered cuts. Never force a slice across a boundary the rules above drew.

Tickets never drive the split. Attach the spec's ticket identifiers to the tasks they describe, so
pull requests and commit messages can cite them.

### 3. Order

Dependencies come from the spec's build order and its phase table. Record each as a `depends-on`
edge between task slugs: an edge means the other task must land first. Propose each task's branch
name following its repository's visible convention — existing branches show it.

Then fix the reading order: a topological sort of the `depends-on` graph, ties broken by the
spec's phase-table order, then alphabetically by slug. This ordinal becomes the filename prefix in
step 6. It is a review order for a human walking the directory, not an execution constraint —
parallel threads have to interleave somewhere, and the truth about ordering stays in the
`depends-on` edges.

### 4. Coverage

Before writing anything, check — and say in the report — that:

- every work item is in exactly one task;
- every element code lands in at least one task. An element no work item builds is a spec defect:
  stop and recommend `fd3:validate-spec`;
- every task has at least one element and a done criterion naming a verification row;
- the dependency graph has no cycles and every edge points at a task that exists.

### 5. Ask

Put every judgment call to the user at once, following the batching protocol in
`${CLAUDE_SKILL_DIR}/../../references/question-batching.md`. The target directory joins the first
batch: recommend `<spec-dir>/tasks/`.
Grouping calls, size doubts and a missing branch convention are the user's; everything else the
rules above already decided, so report it rather than ask.

### 6. Write and report

One Markdown file per task, named `<NNNN>-<slug>.md` — a zero-padded four-digit ordinal from the
reading order of step 3, then the slug — in English regardless of the conversation's language.
The ordinal lives only in the filename: `depends-on` and every other reference carry the bare
slug, so a regeneration may renumber freely without breaking an edge. YAML frontmatter carries
the machine-readable fields; the body carries the brief.

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

The body obeys the index card rule: the goal in the task's own words, pointers by element code and
section heading, nothing copied out of the spec — no contract prose, no schemas, no `path:line`
lists. The implementation agent reads those from the spec sections the pointers name.

Close with a report: one table — slug, repository, branch, phase, depends-on, elements — plus where
the files went, the coverage statement from step 4, and anything the user still owes an answer.
