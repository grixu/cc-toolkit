---
name: implement-tasks
description: Mass-implement a directory of task files on a dynamic workflow — dependency-ordered waves in isolated worktrees, batched per-repository validation (CI, then code review), human-in-the-loop only where a task demands it, and a push/PR proposal at the end. Use when the user wants split tasks implemented.
argument-hint: "<path to the tasks directory>"
---

The tasks to implement: **$ARGUMENTS**

If no path was given, ask which tasks directory to implement. A path that holds no task files
itself but contains a `tasks/` subdirectory means that subdirectory. If the path does not
resolve or holds no task files, say so and stop.

Task files are the state store here. Their frontmatter statuses — `todo`, `in-progress`,
`implemented`, `blocked`, `done` — are what survives an interrupted run, so every status change
happens in the files, never only in conversation. The spec stays read-only for this run and
every agent in it: a defect found in a task or the spec mid-run is a reason to stop and say so,
never something to fix in passing. After the report, a correction the user asks for is theirs
to have.

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

Post this checklist before your first tool call, and again in full — marks updated — before every
user interaction (the question batch, each report round) and at the close:

```
- [ ] 1. Read the graph: parse task frontmatter, resolve repositories, check integrity
- [ ] 2. Put the judgment calls to the user, in one batch
- [ ] 3. Launch the implement-run workflow and wait for its report
- [ ] 4. Work the report: HIL items, relaunch until done or the user stops
- [ ] 5. Propose push and pull requests — never push unasked
```

### 1. Read the graph

Parse the YAML frontmatter of every task file in the directory: slug (the filename without its
ordinal prefix and extension), name, repository, branch, branch-base, phase, depends-on, status,
tickets. The spec is not read — the task files are the whole input.

Then make the graph launchable:

- **Resolve the spec path.** Each task's `spec:` pointer is relative to its own file — usually
  `../SPEC.md`, one directory above the tasks directory. Resolve it to an absolute path and check
  the file exists; the spec itself stays unread — implementation agents read it, this step only
  guarantees the path is real. When the resolved path does not exist (or tasks point at different
  files), the spec location joins the step-2 batch.
- **Resolve repositories to absolute paths.** A `repository:` value that is not an existing
  directory is a missing input, not something to search for: it joins the step-2 batch, naming
  the tasks it blocks.
- **Sync with origin.** In every resolved repository run `git fetch origin` — mandatory, stale
  local refs poison every branch cut from them. Record the default branch and its
  `origin/<default>` ref; note which branch the checkout currently sits on and whether that
  branch carries commits beyond `origin/<default>`. A repository parked on a non-default branch,
  or a base candidate behind `origin/<default>`, joins the step-2 batch.
- **Resolve each branch's stack base.** Read it from the tasks' `branch-base:` field — the split
  records the same value on every task of a branch, and a disagreement inside one branch joins
  the step-2 batch. Only when the field is absent (tasks split before it existed), derive it:
  order the repository's distinct `branch:` values by their tasks' rollout phase (the numeric
  prefix of `phase:`; `cleanup` sorts after every numbered phase), the first stacking on the
  repository's base ref (`baseBranch: null` — resolved to the `defaultRef` confirmed in step 2),
  each later one on the previous unit's branch. A derived base is a guess about a decision the
  split made — the report says which bases were read and which derived. The workflow starts
  worktrees and the pull-request chain from these.
- **Check integrity**: no dependency cycles, every `depends-on` edge points at a task that
  exists **and carries a lower ordinal** — the merge planning relies on the file order being
  topological — and every status is one of the five. A broken graph stops the run — recommend
  re-running `fd3:split-to-tasks` rather than patching by hand.
- **Classify what a resumed run inherits**: `done` is skipped; `implemented` re-enters the first
  merge round — whether its branch already reached the target is git's knowledge, and an
  already-merged branch no-ops there; `blocked` is presented as an existing HIL item; a stale
  `in-progress` is a judgment call — its worktree may hold real commits — so it joins the step-2
  batch (reset to `todo`, or promote to `implemented` when the work is visibly there).

### 2. Ask

One batch, following `${CLAUDE_SKILL_DIR}/../../references/question-batching.md`:

- which code-review skills to run during validation — offer only names present in this session's
  skill listing, never one recalled from memory; the lens is roughly two fifths of the run, and a
  review bot on the pull request finds different things, not the same ones — `none` is a valid
  answer but a real trade;
- the spec path, when the `spec:` pointers did not resolve to an existing file in step 1;
- any unresolved repository paths, `branch-base:` disagreements and stale `in-progress` calls
  from step 1;
- per repository parked on a non-default branch: is that branch the intended base for this work,
  or does the run start clean from `origin/<default>`? Asked once per touched repository — a
  user mid-feature may already have chosen the branch the work belongs on;
- per chosen base branch behind `origin/<default>`: merge it up before work starts. On consent
  the skill performs that merge itself, before launch; a merge that conflicts becomes a HIL item
  instead of a silent stale base;
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
    repos: { "<repository path>": { defaultRef: "<the step-1/2 base, e.g. origin/main>",
             parkedBranch: "<only when a target branch is the repository's current checkout>" }, ... },
    reviewSkills: [<the step-2 answer>],
    maxFixRounds: 3,
    toolchain: <on a relaunch: the previous report's toolchain — omit on a first launch>,
    baseline: <likewise>
  }
})
```

`file` and `repository` are absolute paths (`repository: "none"` for operational tasks);
`dependsOn` carries bare slugs; `baseBranch` is the stack base from step 1, `null` for the
repository's `defaultRef` — the ref the user confirmed in step 2, fetched fresh in step 1.
Worktrees and target branches are cut from that ref (or the task's stack base). When step 2
established that a target branch is the branch the repository itself is parked on, say so via
`parkedBranch` — git refuses a second worktree for it, and the workflow must know to use the
main checkout rather than discover the refusal. On a relaunch, pass `toolchain` and `baseline`
from the previous report so the run skips a re-scout and re-baseline of repositories it already
knows. The workflow owns everything between launch and report. This section is the whole launch
contract — do not read the workflow script, and do not re-implement the loop in conversation or
dispatch implementation agents yourself.

### 4. Work the report

The completion notification truncates the result — read the full report from the notification's
`<output-file>` path before relaying anything. The workflow returns per-task statuses,
per-branch validation outcomes (with each branch's review findings), agent `caveats`, the HIL
list, the tasks left unreachable behind blockers, and its `toolchain` and `baseline` knowledge.
Relay it faithfully — a failed CI stays failed in the telling, and any totals you state are the
report's own `tasks[]` tally, never hand-counted — with one distinction the report already
draws: `no-verdict` items are absence of evidence (an agent died twice on a transient API
failure), never failures. Relay them as "no verdict" and simply include them in the relaunch.

Caveats are triaged, not relayed wholesale: one that names a decision the agent took, a risk,
an as-built deviation or a commit no review saw goes to the user; one that reports compliance
with its own prompt, or restates what the task file already records, does not. Write the full
list to `caveats.txt` in the session scratchpad and give its path.

For each HIL item, put the decision to the user: an operational task is theirs to execute (offer
the task file's steps as a script to follow; mark `done` only when they confirm); a blocker or
conflict needs their call on how to proceed. A CI failure on the list may be diagnosed first —
read-only, in the branch's worktree — so the question puts analyzed options before the user
instead of raw output; the diagnosis then travels verbatim in the repair `instructions`, sparing
the repair agent a re-investigation. The answers split into two lanes:

- **Decisions that unblock tasks** — update the affected task files and relaunch `implement-run`
  the same way; statuses make the rerun skip everything finished.
- **Decisions that change existing branches** — compose them into `repairs` and launch the
  repair workflow; do not edit worktrees yourself:

  ```
  Workflow({
    scriptPath: "${CLAUDE_SKILL_DIR}/../../workflows/repair-run.js",
    args: {
      repairs: [{ repo, branch, worktree, base, instructions: [<the user's decisions for this
                 branch, quoted verbatim>], taskFiles: [<task files to flip to done on pass>] }, ...],
      repos: <as at launch>,
      toolchain: <from the report>,
      baseline: <from the report>,
      maxFixRounds: 3
    }
  })
  ```

  `base` is the branch's stack base (or the repo's `defaultRef`). Passing `toolchain` and
  `baseline` through spares a re-scout — extract both mechanically from the report's output
  file (jq, node), never retype them by hand; when extraction is impractical, omitting them is
  the sanctioned trade — and the cost is not one agent but a full re-scout plus a full baseline
  pipeline on every repository in the run. Repair agents receive the decision as their sole
  authority and never read the spec. Repair validation is CI only — no code review.

One carve-out from the second lane: a purely mechanical git operation — merging an existing
task branch into its target, reverting a named commit — may be done by this skill directly when
the decision deliberately leaves the branch incomplete, because a repair-run would fail its own
CI on that intended state. Anything that touches file content still goes through `repair-run`.

Never run two workflows at once — validation tolerates exactly one build/lint/test pipeline on
the machine. Repairs first, then the implement relaunch. When a relaunch completes, check its
branches against the standing HIL decisions before relaying success — an agent that undid a
reserved human step is the first thing to report, not a footnote. Repeat until every task is
`done` or the user stops.

When the run parks on human work — HIL items that need days, not minutes — offer to write an
ordered handoff file (`HIL_ACTIONS.md` next to the tasks directory): the human steps in order,
each pointing at its task file and what it unblocks, plus where the branches and worktrees
live. A pause that survives only in this conversation is state lost.

### 5. Propose, never push

When every repository-bearing task is `done`: one table — repository, branch, its stack base,
tasks on it, the element codes those tasks carry, proposed pull-request title citing the
tickets — with the still-open operational tasks listed alongside; they need the branches landed
first, so they never gate this proposal. Stacked branches make a pull-request chain: each pull
request's base is its branch's stack base, and after one lands its successor is retargeted onto
the default branch — but only when the predecessor landed as a merge commit. After a squash
merge the predecessor's branch is no longer an ancestor of the default, so a bare retarget
shows the whole stack as new: merge `origin/<default>` into the successor first, then retarget.
Say that in the proposal. Then propose pushing the branches and opening the pull requests. Only
after explicit consent: push, `gh pr create` per branch (`--base` set to the stack base) with a
description naming the tasks, the spec and the branch's element codes. Offer cleanup — remove
the `.worktrees` directories and delete the merged `task/<slug>` branches — as its own
question, never coupled to the push: declining to publish while wanting a clean repository is a
normal combination. If push consent does not come, leave everything local and say where it
lives — and when the tasks directory is untracked, say that too: it is the only copy of the
run's state store, one `git clean -fd` away from gone.
