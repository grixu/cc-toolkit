---
name: split-to-tasks
description: Split a spec into task files — one task per worktree, tasks grouped onto shared branches by the spec's rollout gates, one branch per pull request. Use when the user wants a SPEC divided into implementable tasks.
argument-hint: "<path to the spec file>"
---

The spec to split: **$ARGUMENTS**

If no path was given, ask which spec to split. If the path does not resolve, say so and stop.

The spec is read-only here. A defect you find in it — an element no work item builds, a work item
that cites nothing — is a reason to stop and report it, never something to fix in passing.

## Terms

- **Task** — the smallest set of the spec's work items that is independently verifiable and leaves
  its repository mergeable. **One task = one worktree.** A task is the unit of implementation,
  never of review — review has its own unit below.
- **Branch** — the unit of review: **one branch = one pull request**, and tasks group onto shared
  branches. The default group is one branch per repository per **landing unit** — the span of
  consecutive rollout phases up to and including a gate in the spec's rollout table.
- **Operational task** — the one sanctioned exception: work done by hand against
  the live system (a `gcloud` sequence, a console action) with no pull request. It exists when
  the spec names a gate whose hand-run steps no repository carries — dependents or not: a final
  gate nothing waits on still gets its task, or the rollout's last manual steps vanish from the
  split. Its frontmatter
  says `repository: none` and leaves `branch` empty — these fields are machine-read, so prose in
  them breaks the reader — and its body closes with a `## Note` saying why no pull request exists.
- **The index card rule** — a task file carries pointers, never copies. The spec stays the single
  source of truth. Contract prose copied into a task is a second source of truth that rots
  silently, because nothing detects that the spec moved on.

## Precondition

Splitting propagates the spec's defects into every task. A validation verdict in this
conversation settles the question. Otherwise the spec must carry all three: read its evidence
record **from the bottom** — the last verdict line in the file is the current one, position
decides and not the date — that line records no blocked claims, and its count equals `wc -l` on
the spec.

Anything short of that — blocked claims, a count that does not match, a dated block with no
verdict line, no pass anywhere — is a stop before step 1. A dated heading over verified rows is not
a verdict. Validating is not this skill's work, and no command is named for it: on *validate first*
the split ends with nothing written. What lifts the stop is the user's answer, never your own — say
what the record holds, then ask, once, whether to validate first or split as-is. The message that
ends the run says what the record held and which way the user answered.

## Workflow

Post this checklist before your first tool call, and again in full — marks updated — before every
user interaction (the question batch, the report) and at the close:

```
- [ ] 1. Enumerate: work items, element codes, phases and gates, ownership, tickets
- [ ] 2. Cut along the boundaries
- [ ] 3. Group tasks onto branches along the rollout gates
- [ ] 4. Order by phase and dependency
- [ ] 5. Check coverage
- [ ] 6. Put the judgment calls to the user, in one batch
- [ ] 7. Write the task files and report
```

### 1. Enumerate

Read the spec in full. List every work item from the per-repository section with the element
codes it names, every rollout phase with its gate marker, the ownership table with any landing
constraints, and the ticket identifiers. A fact the spec does not give you — a repository's
branch naming convention, the plausible blast radius of an item — is yours to look up yourself:
a direct command for a specific fact (`git branch -r`, a tracker query), `Explore` dispatched
into the repository when finding it takes searching. When a fact needs a dispatch rather than a
direct command, read `${CLAUDE_SKILL_DIR}/../../references/fact-routes.md` first — it holds the
routes and the dispatch rules. Most splits need none. Never ask the user what you can read.

Before naming a branch or recording a base, `git fetch` every repository the spec touches and record
what you fetched: the default branch, its `origin/<default>` commit, and whether the checkout's
current branch is behind it. The base you write into `branch-base:` is the ref the implementation
stage cuts worktrees from; a base derived from a week-old local ref is a worktree that starts from
the wrong commit, and nothing downstream re-derives it.

Record each repository's absolute root path and write that path into `repository:`. A remote slug is
not a location: the next stage resolves it by guessing among the user's checkouts, and a feature
worked on in a second worktree is exactly where the guess goes wrong.

### 2. Cut

The raw material is the work items. Every task is a subset of them, and every item lands in
exactly one task — unless a rule below cuts through the item itself, in which case it is split
along that cut and the seam is named. Apply the boundaries in order — each is a rule with a
reason, and the reason decides the edge cases:

1. **A repository always cuts.** A task is implemented in one worktree of one repository, and two
   repositories cannot share a branch. This holds even when one team owns both repositories.
2. **Inside a monorepo, ownership cuts.** The unit is a subtree with one review-and-apply owner —
   the spec's ownership section says whose. An item set whose review needs two teams' approval is
   two tasks, and their branches never group either (step 3).
3. **A rollout phase cuts.** A task belongs to one phase; an item set spanning two phases is two
   tasks, ordered. Whether a phase closes a landing unit matters to branch grouping, not to this
   cut.
4. **Irreversibility cuts, and moves to the front.** An element whose change is irreversible or
   contends for a shared environment — a database migration is the canonical case — gets its own
   task, placed as early as its dependencies allow, so it lands on the main branch before anything
   queues up behind the environment. Expand early; the contracting half lives in the spec's cleanup
   section and becomes its own late task, behind the gate the spec names, carrying `phase: cleanup`
   in its frontmatter — cleanup is not a rollout phase, and a section reference in a machine-read
   field breaks the reader.

Within what survives the boundaries, prefer the smallest task that makes one verification row
pass. Where one repository owns a whole behaviour, that yields a vertical slice — schema, endpoint
and UI landing together. Where ownership or rollout forbids it, it degrades honestly into
phase-ordered cuts. Never force a slice across a boundary the rules above drew.

A task that changes the type or shape of a shared identity or contract — a primary-key type, a
wire format, a schema field — owns the ripple: propagation to every consumer, fixtures, seed
data and test seeders included, either inside the task or explicitly handed to a named task.
A ripple nobody owns surfaces as a wall of type errors in whichever branch validates first, and
gets fixed there twice.

Tickets never drive the split. Attach the spec's ticket identifiers to the tasks they describe, so
pull requests and commit messages can cite them.

### 3. Group onto branches

Per repository, walk the spec's rollout table: the consecutive phases up to and including a gate
form one landing unit, and the unit's tasks share one `branch:`. Three overrides, none of them
yours to relax:

- A repository whose ownership section declares a landing constraint — every change lands as its
  own pull request — gets one branch per task there.
- An ownership cut keeps its own branch: a pull request has one review-and-apply owner.
- An irreversible task keeps its own branch when a shared environment is actually contended —
  something would queue up behind it. Where the phase deploys nothing and a revert restores the
  change, the task cut suffices; the report states which reading applied.

Branches of consecutive landing units in one repository **stack**: the first starts from the
repository's default branch, each later one from the previous unit's branch. Record each branch's
base in its tasks' `branch-base:` frontmatter field — the same value on every task of the branch,
and the field implementation reads; a base recorded only in the report is a base lost with the
conversation.

Where a landing constraint has produced one branch per task, only a real ordering stacks: a shared
file, a module its consumers pin, or an environment order the spec states. Tasks applying the same
change to disjoint targets are siblings — each off the default branch, no edge between them —
however tempting a tidy sequence looks. A stack link is a serialisation the implementation stage
pays for per branch: one validation wave each, regardless of diff size, so a chain of N one-file
branches costs N full validation ladders.

Then the size check: estimate each branch's aggregate diff from its tasks' citations. Past **80
changed files or 2000 changed lines**, generated files excluded, a reviewer stops reading and
starts skimming — but the grouping still follows the spec: **warn, never subdivide**. A breach
goes into the report with a recommendation to revisit the spec's rollout table, because a branch
structure the spec does not describe is a second source of truth about the rollout. The threshold
is policy of this skill and never appears in the spec.

### 4. Order

Dependencies come from the spec's build order and its phase table. Record each as a `depends-on`
edge between task slugs: an edge means the other task must land first. Never draw an edge onto
an operational task when the spec lets the code land before that gate — an edge there strands
implementable work behind human hands, and a whole extra run pays for it; a dependency that only
gates *verification* belongs in the task's Done-when, not in the graph. Propose each branch's name
following its repository's visible convention — existing branches show it; the name belongs to the
group, not the task. One exception joins the step-6 batch: when the checkout already sits on a
branch carrying the spec's commits, whether the first landing unit reuses that branch or cuts
fresh by the convention is the user's call — a user mid-feature may have chosen it deliberately.

When the edge onto an operational task is real, carry it up to the branch: a landing unit that
mixes a gate-blocked task with implementable ones cannot reach a complete state in one run. Cut
the blocked task onto its own branch by default. Where the spec's gate genuinely holds the whole
unit, say in the report — and in the blocked task's `## Note`, naming the branch its output must
land on — that the unit lands as a draft pull request until the gate clears.

Then fix the reading order: a topological sort of the `depends-on` graph, ties broken by the
spec's phase-table order, then alphabetically by slug. This ordinal becomes the filename prefix in
step 7. It is a review order for a human walking the directory, not an execution constraint —
parallel threads have to interleave somewhere, and the truth about ordering stays in the
`depends-on` edges.

### 5. Coverage

Before writing anything, check — and say in the report — that:

- every work item is accounted for: in exactly one task, or split across tasks along a named seam
  the report records;
- every element code lands in at least one task. An element no work item builds is a spec defect:
  when exactly one work item's cited files contain it, assign it there and flag the defect in the
  report; anything less unambiguous — stop and report it;
- every delivery task — one that builds or refactors something — has at least one element and a
  done criterion naming a verification row. An operational task that stands an element up carries
  that element's code too, and it counts for coverage: a resource provisioned by hand is still the
  element the spec says will be built. What an operational or cleanup task may lack is the done
  criterion — it names the gate it inherits instead, as the template directs;
- the dependency graph has no cycles, every edge points at a task that exists, and every edge
  points at a lower ordinal — the reading order really is topological, and the implementation
  workflow's merge planning relies on that;
- the `branch-base` chain is rooted, acyclic, single-parent, identical on every task of a
  branch, and its one root is the repository's default branch.

A stop here is a stop before any file exists. The message that ends the run says nothing was
written, and what stopped it.

### 6. Ask

Put every judgment call to the user at once, following the batching protocol in
`${CLAUDE_SKILL_DIR}/../../references/question-batching.md`. The target directory is
`<spec-dir>/tasks/` unless the invocation named one. It joins the batch only when that
directory already holds task files from another spec.
A missing branch convention is the user's; grouping the gates decided and a size breach is a
report with a recommendation, never a question — everything the rules above already settled,
report rather than ask.

### 7. Write and report

One Markdown file per task, named `<NNNN>-<slug>.md` — a zero-padded four-digit ordinal from the
reading order of step 4, then the slug — in English regardless of the conversation's language.
The ordinal lives only in the filename: `depends-on` and every other reference carry the bare
slug, so a regeneration may renumber freely without breaking an edge. YAML frontmatter carries
the machine-readable fields; the body carries the brief.

The shape of each file is `${CLAUDE_SKILL_DIR}/../../references/task-template.md` — read it
before writing the first one. Write each file with the `Write` tool. A heredoc puts the whole
body through a shell, where a guard hook may block it and an interrupted write leaves half a
file behind.

The body obeys the index card rule: the goal in the task's own words, pointers by element code and
section heading, nothing copied out of the spec — no contract prose, no schemas, no `path:line`
lists. The implementation agent reads those from the spec sections the pointers name.

Rendering the files is the one part of this skill worth dispatching. Dispatch the `fork`
sub-agent, one per repository — unnamed, per `fact-routes.md`: it already holds the cuts, the
grouping and the pointers, so its prompt names only the files it writes and this section's
prohibitions. Nothing is left for it to decide; it renders. Then re-run step 5 mechanically
over the written files — coverage is the one check a fan-out cannot perform on itself. A split
of five files or fewer is faster written here.

Write the report to `<spec-basename>.split.md` beside the spec — never inside `tasks/`, where
a task-file glob trips over it. It carries one table (slug, repository, branch, phase,
depends-on, elements), the branch creation order and stack chain per repository, where the
files went, the coverage statement from step 5, every work item split across tasks with its
seam, any size-check warning, the verdict line this split was taken against quoted verbatim,
and anything the user still owes an answer. In the conversation give the path and the table,
not the file. Anything in the report that binds one task's work also goes into that task's
`## Note`, in the imperative — the conversation ends before implementation starts.
