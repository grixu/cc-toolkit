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
`implemented`, `merged`, `blocked`, `done` — are what survives an interrupted run, so every status change
happens in the files, never only in conversation. The spec stays read-only for this run and
every agent in it: a defect found in a task or the spec mid-run is a reason to stop and say so,
never something to fix in passing. After the report, a correction the user asks for is theirs
to have — except a change to the spec. The spec exists once, at the path step 1 resolves, and
changes only through `/fd3:build-spec <spec path>`, which re-validates what it changes. A
discrepancy between the spec and the code, the tasks or a decision — found by you, an agent, a
review or a repair — is a HIL item naming that route: never an edit you make to "align the spec
with the as-built", and never a repair instruction.

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

Post this checklist in full — marks updated, never compressed to a line and never summarised — in
the same reply as every user interaction (the step-2 question batch, each report round) and at the
close. Step 1 needs no announcement: start it with a tool call. A reply that only posts the
checklist ends the turn with nothing done:

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
  repository's base ref (`baseBranch: null` — resolved to the `startRef` confirmed in step 2),
  each later one on the previous unit's branch. A derived base is a guess about a decision the
  split made — the report says which bases were read and which derived. The workflow starts
  worktrees and the pull-request chain from these.
- **Normalise the root's base.** A `branch-base` no task in that repository builds and naming
  either the repository's default branch or the branch its checkout is parked on is that
  repository's root rather than a stack link: it goes to step 3 as `baseBranch: null`, which
  resolves to whichever of the two step 2 settles as `startRef`. Both are step-1 facts, and each
  is matched by branch name — the split roots on the default branch for an ordinary run and
  writes `main` where the ref is `origin/main`, but roots on the parked branch where it found the
  checkout carrying the spec's commits, and which of the two this run wants is step 2's to answer.
  Left as a string either way, the base is worse than noise: the start-point chain takes it
  directly, so the first landing unit is cut from it and the step-2 answer is discarded without a
  word — and, built by no task, it also raises a stack-base diagnostic per repository on every run.
  A parked branch the split also made a target branch is built by a task, so the build check leaves
  that one a stack link.
- **Check every remaining stack base is reachable.** A base some task's `branch:` builds is produced
  by this run. One no task builds has to exist already: `origin` is fetched, so resolve the ref in
  that repository. A base that resolves is a branch the split rooted on and needs nothing; one that
  resolves nowhere joins the step-2 batch. Only here can the two be told apart — the workflow sees
  the task files alone, so it falls back to the repository's default ref and reports the lost
  stacking after the run, when the work is already built on the wrong foundation.
- **Check integrity**: no dependency cycles, every `depends-on` edge points at a task that
  exists **and carries a lower ordinal** — the merge planning relies on the file order being
  topological — and every status is one of the six. A broken graph stops the run — recommend
  re-running `fd3:split-to-tasks` rather than patching by hand.
- **Find the confirmations a task asks for.** A task whose `## Note` asks for a human's
  confirmation or approval before its work starts — a protected path, a consent the repository's
  instructions require — would stop its agent mid-run, since the workflow never waits for a human.
  Read each task's `## Note` for that alone; every such ask joins the step-2 batch, naming the
  task. An approval the pull request's review gives is not one: it gates landing, not writing. A
  `Consent:` line already in the Note settles its ask — an earlier invocation recorded it.
- **Classify what a resumed run inherits**: `done` is skipped; `implemented` and `merged` both
  re-enter the first merge round — whether a branch already reached the target is git's knowledge,
  and an already-merged branch no-ops there, which is what re-records the unit validation runs on,
  so a `merged` task never skips it; `blocked` is presented as an existing HIL item; a stale
  `in-progress` is a judgment call — its worktree may hold real commits — so it joins the step-2
  batch (reset to `todo`, or promote to `implemented` when the work is visibly there).

### 2. Ask

One batch, following `${CLAUDE_SKILL_DIR}/../../references/question-batching.md`:

- whether to review each branch. Review is the `code-review` plugin's headless lenses — one
  agent per lens `cr-prepare` makes active, seven to nine, after the branch's scoped CI passes —
  then a delta review of whatever the automatic fixes changed. It costs roughly a quarter to two fifths of the run, and a review
  bot on the pull request finds different things, not the same ones: `no` is a valid answer but a
  real trade. Offer three answers: `yes` — the fixer applies every fixable finding, security fixes
  (one commit each) and mechanically safe boy-scout fixes included, and what it cannot fix waits in the end-of-run
  report without holding the branch; `gated` — security fixes, boy-scout findings, findings the
  fixer left unfixed and anything the delta review finds hold their branch at `merged` until the
  user settles them, for a user who wants to walk each one; `no`. Recommend `yes` when `code-review:cr-scan` is in this session's skill listing; when it
  is not, run `claude plugin list` before asking: a plugin installed but disabled is named as
  such, with `claude plugin enable code-review` as the step that makes `yes` real, and one not
  installed is named as missing. Ask either way — a listing can be withheld or cut short, and a
  review whose skill is missing comes back as no verdict, never as a clean pass. Take
  no other skill in its place: a skill that asks questions or fans out into agents of its own
  cannot run inside a workflow agent;
- the spec path, when the `spec:` pointers did not resolve to an existing file in step 1;
- any unresolved repository paths, `branch-base:` disagreements and stale `in-progress` calls
  from step 1;
- per repository parked on a non-default branch: is that branch the intended base for this work,
  or does the run start clean from `origin/<default>`? Asked once per touched repository — a
  user mid-feature may already have chosen the branch the work belongs on;
- per chosen base branch behind `origin/<default>`: merge it up before work starts. On consent
  the skill performs that merge itself, before launch; a merge that conflicts becomes a HIL item
  instead of a silent stale base;
- per stack base that no task builds and git cannot resolve: correct it in the task files, or
  launch with those tasks as stack roots. Asked once per base — `branch-base` is identical on
  every task of a branch — and naming the tasks it carries. A launch passes the base through
  unchanged rather than nulling it, so the workflow raises its stack-base item and the run's own
  report carries what was consented to; nulled, those tasks would read as genuine roots and
  nothing would record the anomaly;
- each confirmation a task's `## Note` asks for, from step 1. A yes is written into that task file
  before launch: append the line `Consent: <the user's answer, verbatim>` to its `## Note`. The
  task file is what its implementing agent reads, so a consent recorded only in this batch or
  `implement-answers.md` never reaches it and the agent stops on the ask anyway. An answer that
  withholds it takes the task out of this launch as `blocked`, an item in the report rather than a
  stopped run;
- confirmation of scope when the directory mixes done and pending work.

Everything else — wave composition, branch names, merge order — the task files already decided;
report it, do not ask.

Record the answers in `implement-answers.md` next to the tasks directory, never inside it where it
would read as a task file — the start ref per repository, the review choice, the commit choice,
each consent granted (with its task), and each decision a later report round settles. A later
invocation over the same directory reads that file first and asks only what it does not settle or
what has changed since: a new repository, a base that moved, a stale `in-progress`.

Committing the spec and the tasks directory before launch is the user's call, and the commit
happens where they already live — the repository and branch the spec sits in. Never copy the spec
onto a target or task branch to commit it there: every agent reads it at `specPath`, and a second
copy diverges at the first amendment with nothing saying which one a reader got. When the spec's
checkout is itself parked on a target branch, the option says the commit puts the spec into that
branch's pull request. The commit is a change to the repository like any other: whatever that repository derives from the tree you touched —
a docs index, a manifest, a generated list — regenerate it in the same commit, or say plainly
that you did not. A stale generated file fails validation on every branch of the run at once,
and reads there as the branches' own defect. The recommendation is the spec and the tasks
directory alone. The spec's notes file and research directory are working files — megabytes of
transcripts and scraped pages — and never part of the recommendation; when the spec links them,
the option that leaves them out says so, because a docs build that checks links then fails on
every branch for the whole run, and the user picks.

### 3. Launch

Launch the dynamic workflow and let it run in the background:

```
Workflow({
  scriptPath: "${CLAUDE_SKILL_DIR}/../../workflows/implement-run.js",
  args: {
    specPath: "<absolute path to the spec file, resolved in step 1>",
    tasks: [{ slug, file, name, repository, branch, baseBranch, phase, dependsOn, status }, ...],
    repos: { "<repository path>": { startRef: "<the step-1/2 base, e.g. origin/main or the parked branch>",
             diffBase: "origin/<default>",
             parkedBranch: "<only when a target branch is the repository's current checkout>" }, ... },
    review: <true, "gated" or false — the step-2 answer>,
    decisions: [<on a relaunch: every decision earlier report rounds settled, verbatim>],
    knownBases: ["<repository path>:<branch>", ...],
    maxFixRounds: 3,
    reportPath: <on a relaunch: the previous report's `<output-file>` path — omit on a first launch>
  }
})
```

`decisions` carries every decision the user took on an earlier report of this graph — HIL answers
and repair instructions, verbatim, as `implement-answers.md` records them; a first launch omits it.
Review and fix agents read them as settled, so a finding that would undo one reaches neither a fixer
nor the user again.
`knownBases` lists every `branch-base` no task builds that step 1 resolved to an existing branch, as
`<repository path>:<branch>`; the workflow raises a `graph` item only for the others, so a confirmed
root is not put to the user again on every launch.
`file` and `repository` are absolute paths (`repository: "none"` for operational tasks);
`dependsOn` carries bare slugs; `baseBranch` is the stack base from step 1, `null` for the
repository's `startRef` — the ref the user confirmed in step 2, fetched fresh in step 1.
`diffBase` is always `origin/<default>`: it is what a root branch's diff, its scoped CI and its
review are measured against. On a run that builds on the parked branch, `startRef` names that
branch, and measuring against it would give every review an empty diff.
Worktrees and target branches are cut from `startRef` (or the task's stack base). When step 2
established that a target branch is the branch the repository itself is parked on, say so via
`parkedBranch` — git refuses a second worktree for it, and the workflow must know to use the
main checkout rather than discover the refusal. Merges and fixes for that branch then happen in
the checkout, but its validation does not: the workflow grades it in a detached worktree beside
the repository, so the verdict describes the branch's commit rather than whatever else the user
has open in that tree. On a relaunch, pass `reportPath` — the `<output-file>`
path from the previous run's completion notification. The workflow reads that file's toolchain and
baseline knowledge with one cheap agent, so the run skips a re-scout and a re-baseline of every
repository it already knows. Never transcribe that knowledge into the call yourself: it is tens of
kilobytes of prose, and a command list that differs by a word from the one the baseline measured
against is worse than no baseline at all. The workflow owns everything between launch and report. This section is the whole launch
contract — do not read the workflow script, and do not re-implement the loop in conversation or
dispatch implementation agents yourself.

### 4. Work the report

The completion notification truncates the result — read the full report from the notification's
`<output-file>` path before relaying anything. The workflow returns per-task statuses,
per-branch validation outcomes (with each branch's review findings and the path of its review
`cr-report.md`), agent `caveats`, the HIL
list, the tasks left unreachable behind blockers, and its `toolchain` and `baseline` knowledge.
Relay it faithfully — a failed CI stays failed in the telling, and any totals you state are the
report's own `tasks[]` tally, never hand-counted — with one distinction the report already
draws: `no-verdict` items are absence of evidence (an agent died twice on a transient API
failure), never failures. Relay them as "no verdict" and simply include them in the relaunch.
Relay each branch's `skipped` commands with its outcome: a check that never ran is not a pass.
A check you run yourself never stands in for the gate: a `no-verdict` or `failed-final` branch is
relaunched or repaired, never set to `done` by hand.
`graph` items are the other kind that is information rather than work — one per `branch-base` that
named a branch no task builds, naming the tasks it carries. The workflow sees the task files alone,
so step 1's resolution says what each one means: a base that resolved is the pre-existing branch the
split rooted on, the tasks were cut from it, and the item only confirms that root; a base that
resolved nowhere is one you launched as stack roots on the step-2 answer, and there the stacking
that base implied did not happen. Relay each as a diagnostic saying which it was. What the second
asks for is a corrected task file before the next split or relaunch, never a decision that moves
those tasks, so neither is one of the items step 4 puts to the user below.

A `review` item is a finding the workflow would not fix unasked — a `spec` finding, a security
finding whose fix changes who may reach what, a finding whose fix would change behaviour the spec
states, a report-only
one, a boy-scout finding whose fix is not mechanically safe, a finding the fixer left unfixed, or
anything the delta review found in the fixes it did apply; under `gated`, also every `security`
fix and every boy-scout finding. Three notices ride the same kind and hold a `gated` branch the same
way: a real problem no review rule covers (settled like a finding: a repair, or dismissed), a
structural comment verdict such as a MOVE (applied by a repair, or dismissed), and a
`run /security-review` pointer — a command for the user to run on the files the review skipped,
never something a repair fixes; it is settled when the user has run it or dismisses it. Without `gated` the item holds nothing: its branch is `done`, and
the item waits in the end-of-run decision list (step 5), never as a question of its own. Under
`gated` the branch passed CI and stays `merged` until the item is settled: a finding the user wants
fixed goes to a repair; one the user dismisses needs no work, and when every `review` item of a
branch is settled without a repair — dismissed, or a `/security-review` pointer the user ran — set that branch's tasks to `done` yourself — CI already passed on the commit
they sit on. Give the `cr-report.md` path with the findings: the one-line form in the HIL list drops
the evidence.

Caveats are triaged, not relayed wholesale, and triage is not a question. One that names a
decision the agent took inside its task, a risk, an as-built deviation or a commit no review saw
is kept as built and listed under *Decisions taken for you* in the end-of-run report (step 5),
each with how to revert it — a cap the agent chose, a guard it added, a fallback it picked. Doc
drift the run's own changes caused — a README, an index or a reference a branch made stale — goes
to a repair without asking. Only a caveat that contradicts a spec decision or names an
irreversible operation becomes a question. One that reports compliance with its own prompt, or
restates what the task file already records, is dropped. Write the full list to `caveats.txt` in
the session scratchpad and give its path.

Put to the user only what needs a human: an operational task is theirs to execute (offer the task
file's steps as a script to follow; mark `done` only when they confirm), and a blocker or a
judgment conflict needs their call on how to proceed. Every such decision of one report goes in one
batch — never one question per turn. A `ci` item is not a question: diagnose it — read-only, in
the branch's worktree — and send it to `repair-run` with the diagnosis verbatim in the
`instructions`, sparing the repair agent a re-investigation. It becomes a question only when the
diagnosis shows the fix must change behaviour, the case the fixer already refused. Diagnose by
**running the failing check** in that worktree and reading what it says. Grepping the source for
what the report's message suggests names a plausible cause, not the cause: the check is the only
thing that knows which of them is true, and a repair composed from the plausible one costs a full
round to disprove. A failure the branch did not cause — the baseline already failed that check, or
it sits in files no task on the branch touched — is no repair's to fix: a repair-run grades the
same check and fails it again. It is a question (fix it as its own decision, or accept it as a known
failure), asked before any repair launches on that branch.

What the loop does next is never a question. Relaunching after a decision, rerunning a check that
died on a transient failure, launching the repair a decision implies, updating the handoff file —
do it and say what you did. When the user reports a human step done, check it where it can be
checked — the task file's verification, the live state — and carry on. A spec discrepancy — a
`spec` finding, a caveat that contradicts the spec, an as-built deviation the user wants kept — is
put to the user as a HIL item whose route is `/fd3:build-spec <spec path>`: keep the code as built
and amend the spec there, or change the code to match the spec through the lanes below. Neither
you nor a repair agent edits the spec, and no repair `instructions` line asks for it. The answers
split into two lanes:

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
      specPath: <as at launch>,
      review: <as at launch>,
      decisions: <as at the latest launch>,
      reportPath: <the previous report's `<output-file>` path>,
      maxFixRounds: 3
    }
  })
  ```

  `base` is the branch's stack base (or the repo's `diffBase`). `reportPath` is the previous
  report's output file; the workflow reads its toolchain and baseline knowledge itself, which is
  what spares a full re-scout plus a full baseline pipeline on every repository in the run. Pass
  the path, never the knowledge. Repair agents receive the decision as their sole
  authority and never read the spec.

  A repair reopens its branch. Before launch, set every `done` task on a repaired branch back to
  `merged` and list it in that branch's `taskFiles` — the tasks were marked done on a tree the
  repair is about to change, and only the repair's own final gate may mark them again. Every
  branch stacked on a repaired branch, transitively, joins `repairs` too, with `instructions: []`
  and its own done tasks reset the same way: it carries the repaired base and owes it a CI run,
  which a merge-up done by hand never gets. With
  review on, the workflow reviews the repair's own commits after its CI passes; those findings
  come back as `review` items for the user, never to a fixer, and hold the branch only under
  `gated`.

  An `instructions` line says what to change, never asks for validation. "Then run the tests and
  confirm they pass", "verify the build is green" — the workflow runs CI itself, after the agent
  returns, and an agent that runs it too puts a second pipeline on a machine that tolerates one.

One carve-out from the second lane: a purely mechanical git operation — merging an existing
task branch into its target, reverting a named commit — may be done by this skill directly when
the decision deliberately leaves the branch incomplete, because a repair-run would fail its own
CI on that intended state. Anything that touches file content still goes through `repair-run`.

Never run two workflows at once — validation tolerates exactly one build/lint/test pipeline on
the machine. Repairs first, then the implement relaunch. While a workflow runs, its worktrees and
target branches are its alone: no edit, commit, merge or checkout in them from this conversation —
the mechanical carve-out above included — because an agent mid-step then works on a tree that
moved under it. When a relaunch completes, check its
branches against the standing HIL decisions before relaying success — an agent that undid a
reserved human step is the first thing to report, not a footnote. Repeat until every task is
`done` or the user stops; a stop still closes with step 5, because the deferred decisions and
open `review` items exist nowhere else.

When the run parks on human work — HIL items that need days, not minutes — write an
ordered handoff file (`HIL_ACTIONS.md` next to the tasks directory): the human steps in order,
each pointing at its task file and what it unblocks, plus where the branches and worktrees
live, followed by *Decisions taken for you* and the open `review` items as step 5 lists them. A
pause that survives only in this conversation is state lost.

Every task or branch you mention — in a report, in `HIL_ACTIONS.md`, in a question — leads with the
task's `name:` or a short description of the branch; a split code or ordinal (`m1`, `C1`) goes in
parentheses after it, never alone: the user reads the report, not the split.

### 5. Propose, never push

When every repository-bearing task is `done`, or the loop ends short of that, close with one
end-of-run report and one question batch — everything the run deferred lands here, so nothing
earlier had to stop for it. A loop that ended short proposes only the branches whose tasks are all
`done` and asks nothing about the rest; their state is in the report. The report
holds, in this order: one table — repository, branch, its stack base,
its worktree path, tasks on it, the element codes those tasks carry, proposed pull-request title
citing the tickets; the still-open operational tasks — they need the branches landed first, so
they never gate this proposal; *Decisions taken for you*, each with how to revert it; and the
`review` items left open, numbered, each with its `cr-report.md` path. Stacked branches make a pull-request chain: each pull
request's base is its branch's stack base, and after one lands its successor is retargeted onto
the default branch — but only when the predecessor landed as a merge commit. After a squash
merge the predecessor's branch is no longer an ancestor of the default, so a bare retarget
shows the whole stack as new: merge `origin/<default>` into the successor first, then retarget.
Say that in the proposal. The batch then asks two things: whether to push the branches and open
the pull requests, and which open `review` items, by number, go to a repair before that. Recommend
per item on its merit and offer one "all fixable" option; list a branch's boy-scout findings — the
report's separate list, pre-existing code in a touched file — on their own line, recommended to
leave. A decision taken for the user that they want reverted is named the same way. Only
after explicit consent: push, `gh pr create` per branch (`--base` set to the stack base) with a
description naming the tasks, the spec and the branch's element codes. When the repository's own
rules reserve pushing to a human — its `AGENTS.md`, `CLAUDE.md` or contributing guide says so —
the push is not a question: print the exact `git push` and `gh pr create` commands instead.
The batch also asks about cleanup, recommending it: remove the `.worktrees` directories and
the merged `task/<slug>` branches now, or keep them and print the commands that remove them. A
`task/<slug>` branch with commits its target branch does not contain is never removed, whatever
the answer — it is unmerged work, and the report names it. Declining to publish while wanting a
clean repository is a normal combination. If push consent does not come, leave every target
branch local. The worktree paths are
in the table whatever the user decides: a branch whose worktree nobody can name is a branch the
user cannot open, and the run's own directories are not guessable. When the tasks directory is
untracked, say that too: it is the only copy of the
run's state store, one `git clean -fd` away from gone.
