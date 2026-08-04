---
name: implement-tasks
description: Mass-implement a directory of task files on a dynamic workflow — dependency-ordered waves in isolated worktrees, batched per-repository validation (CI, then code review), human-in-the-loop only where a task demands it, and a push/PR proposal at the end. Use when the user wants split tasks implemented.
argument-hint: "<path to the tasks directory>"
---

The tasks to implement: **$ARGUMENTS**

If no path was given, ask which tasks directory to implement. If the path does not resolve or
holds no task files, say so and stop.

Task files are the state store here. Their frontmatter statuses — `todo`, `in-progress`,
`implemented`, `blocked`, `done` — are what survives an interrupted run, so every status change
happens in the files, never only in conversation. The spec stays read-only; a defect found in a
task or the spec mid-run is a reason to stop and say so, never something to fix in passing.

## Terms

- **Wave** — one turn of the implementation loop: every task whose dependencies are all merged
  or `done` runs in parallel, each in its own worktree on a `task/<slug>` branch cut from its
  target branch. A wave closes with a merge of its results into their target branches, so the
  next wave starts from a state that already contains everything before it.
- **HIL item** — anything only a human can move: an operational task (`repository: none`), a
  blocker an agent refused to guess past, an unresolved merge conflict, a branch whose CI would
  not pass within the fix budget. The workflow never waits for a human mid-run — it finishes and
  reports, and this skill handles the conversation.
- **Validation unit** — a repository + target branch pair. Validation is batched per unit and
  units run one at a time, so at most one build/lint/test pipeline ever runs on the machine —
  that is what keeps a multi-hour run stable.

## Workflow

Post this checklist before your first tool call, and post it again with the marks updated each
time a step completes:

```
- [ ] 1. Read the graph: parse task frontmatter, resolve repositories, check integrity
- [ ] 2. Put the judgment calls to the user, in one batch
- [ ] 3. Launch the implement-run workflow and wait for its report
- [ ] 4. Work the report: HIL items, relaunch until done or the user stops
- [ ] 5. Propose push and pull requests — never push unasked
```

### 1. Read the graph

Parse the YAML frontmatter of every task file in the directory: slug (the filename without its
ordinal prefix and extension), name, repository, branch, phase, depends-on, status, tickets. The
spec is not read — the task files are the whole input.

Then make the graph launchable:

- **Resolve the spec path.** Each task's `spec:` pointer is relative to its own file — usually
  `../SPEC.md`, one directory above the tasks directory. Resolve it to an absolute path and check
  the file exists; the spec itself stays unread — implementation agents read it, this step only
  guarantees the path is real. When the resolved path does not exist (or tasks point at different
  files), the spec location joins the step-2 batch.
- **Resolve repositories to absolute paths.** A `repository:` value that is not an existing
  directory needs resolving — look for it near the tasks directory and among the user's checkouts
  before asking; a genuine ambiguity joins the step-2 batch.
- **Derive each branch's stack base.** Order each repository's distinct `branch:` values by their
  tasks' rollout phase (the numeric prefix of `phase:`): the first stacks on the repository's
  default branch (`baseBranch: null`), each later one on the previous unit's branch; branches
  sharing a phase share a base. The workflow starts worktrees and the pull-request chain from
  these.
- **Check integrity**: no dependency cycles, every `depends-on` edge points at a task that exists,
  every status is one of the five. A broken graph stops the run — recommend re-running
  `fd3:split-to-tasks` rather than patching by hand.
- **Classify what a resumed run inherits**: `done` is skipped; `implemented` re-enters the first
  merge round — whether its branch already reached the target is git's knowledge, and an
  already-merged branch no-ops there; `blocked` is presented as an existing HIL item; a stale
  `in-progress` is a judgment call — its worktree may hold real commits — so it joins the step-2
  batch (reset to `todo`, or promote to `implemented` when the work is visibly there).

### 2. Ask

One batch, following `${CLAUDE_SKILL_DIR}/../../references/question-batching.md`:

- which code-review skills to run during validation — list what is installed and let the user
  pick; none is a valid answer;
- the spec path, when the `spec:` pointers did not resolve to an existing file in step 1;
- any unresolved repository paths and stale `in-progress` calls from step 1;
- confirmation of scope when the directory mixes done and pending work.

Everything else — wave composition, branch names, merge order — the task files already decided;
report it, do not ask.

### 3. Launch

Launch the dynamic workflow and let it run in the background:

```
Workflow({
  scriptPath: "${CLAUDE_SKILL_DIR}/../../workflows/implement-run.js",
  args: {
    tasksDir: "<absolute path>",
    specPath: "<absolute path to the spec file, resolved in step 1>",
    tasks: [{ slug, file, name, repository, branch, baseBranch, phase, dependsOn, status }, ...],
    reviewSkills: [<the step-2 answer>],
    maxFixRounds: 3
  }
})
```

`file` and `repository` are absolute paths (`repository: "none"` for operational tasks);
`dependsOn` carries bare slugs; `baseBranch` is the stack base from step 1, `null` for the
repository's default branch. Do not re-implement the loop in conversation and do not dispatch
implementation agents yourself — the workflow owns everything between launch and report.

### 4. Work the report

The workflow returns per-task statuses, per-branch validation outcomes, the HIL list, and the
tasks left unreachable behind blockers. Relay it faithfully — a failed CI stays failed in the
telling.

For each HIL item, put the decision to the user: an operational task is theirs to execute (offer
the task file's steps as a script to follow; mark `done` only when they confirm); a blocker or
conflict needs their call on how to proceed. When their answers unblock tasks, update the
affected task files and relaunch the workflow the same way — statuses make the rerun skip
everything finished. Repeat until every task is `done` or the user stops.

### 5. Propose, never push

When all tasks are `done`: one table — repository, branch, its stack base, tasks on it, proposed
pull-request title citing the tickets. Stacked branches make a pull-request chain: each pull
request's base is its branch's stack base, and after one lands its successor is retargeted onto
the default branch. Say that in the proposal. Then propose pushing the branches and opening the
pull requests. Only after explicit consent: push, `gh pr create` per branch (`--base` set to the
stack base) with a description naming the tasks and spec, and offer to clean up — remove the
`.worktrees` directories and delete the merged `task/<slug>` branches. If consent does not come, leave everything local and say where it lives.
