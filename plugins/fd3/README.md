# fd3

fd3 is a Claude Code plugin that takes a feature idea to reviewed branches in your repositories.
You start three steps yourself:

1. Decide. Claude interviews you about the idea until every design decision is made, writes the
   decisions up as a spec, and checks every claim in the spec against your code.
2. Split. fd3 cuts the spec into small task files and groups them onto the branches that will
   become pull requests.
3. Build. Agents implement the tasks in parallel, each in its own git worktree. Each branch then
   runs through your repository's checks and, if you want, an automated code review. You get a list
   of what needs a human and, at the end, a proposal to push the branches and open the pull
   requests.

## Why

Give an agent a one-line feature request and it fills every gap with a guess: which table, which
retry policy, which team owns the deploy. The guesses surface late, as rework in review. fd3 moves
those decisions to the start, where you make them, and writes them into a document the later steps
read instead of your chat history. Each step hands the next one a file, so an implementation run
that stops halfway restarts from those files.

## How it works

```
  you type                          what happens                          what it leaves

  /fd3:build-spec <idea or plan>
        |-- interview      rounds of numbered questions you answer     notes file
        |-- write          turns your answers into a spec              the spec, in your repo
        '-- validate       checks every claim against the code and     a verdict at the end
                           fixes what facts settle (up to 3 passes)    of the spec
                                          |
  /fd3:split-to-tasks <spec>              v
        '-- cuts the spec into tasks, groups them onto branches,       tasks/NNNN-<slug>.md
            orders them by dependency                                   <spec>.split.md
                                          |
  /fd3:implement <tasks dir>              v
        |-- implement-run  (background) waves of parallel agents,      branches and worktrees
        |                  one worktree per task, merged into the       beside the repository
        |                  branch, then checks and code review
        |-- you decide the items only a human can settle
        |-- repair-run     (background) applies your decisions
        '-- proposes push and pull requests; pushes only if you say yes
```

## Requirements

| Needed for | Requirement |
|---|---|
| Everything | Claude Code, and a git checkout of each repository the work touches, with an `origin` remote. The interview, validation, split and implementation each run `git fetch` first. |
| `/fd3:implement` | Dynamic workflows. They are available on paid plans and with Anthropic API access; on Pro, turn them on from the "Dynamic workflows" row in `/config`. They are off when `disableWorkflows` is `true` in your settings or `CLAUDE_CODE_DISABLE_WORKFLOWS=1` is set. Depending on your permission mode, Claude Code asks you to approve each workflow launch. |
| Opening pull requests | The `gh` CLI, logged in. fd3 runs `gh pr create` for each branch after you agree. |
| Documentation lookups | The context7 and firecrawl MCP servers. fd3's research sub-agent uses them as its sources for library and API documentation. |
| Automated code review (optional) | The [`code-review`](../code-review) plugin, version 0.4.0 or later. Earlier versions lack the skills fd3 calls; the review then returns no verdict and the branches stay `merged`. |

## Install

```
/plugin marketplace add grixu/cc-toolkit
/plugin install fd3@cc-toolkit
/plugin install code-review@cc-toolkit
```

The last line is optional; you need it only for automated code review.

## Commands

| Command | Use it when | Leaves behind |
|---|---|---|
| `/fd3:build-spec <idea, or path to a plan>` | You have an idea or a draft plan and want a checked spec. | A spec in your repository, with the interview notes and research beside it. |
| `/fd3:build-spec <path to an existing spec>` | A spec exists but was edited after it was checked, or the code has moved on. fd3 skips the interview and checks the spec again. `split-to-tasks` sends you here when it refuses a spec. | The same spec with a new verdict. |
| `/fd3:split-to-tasks <path to spec>` | The spec's last verdict is `ready`. | A `tasks/` directory next to the spec, and `<spec name>.split.md`. |
| `/fd3:implement <tasks dir>` | You have a tasks directory. Run it again on the same directory to resume. | Branches, worktrees, updated task statuses, and a push and pull-request proposal. |

Two more entry points:

- `/fd3:grill-topic <topic>` runs only the interview. It ends with a notes file in the session's
  scratch directory, and nothing turns that file into a spec. Use it to stress-test an idea; use
  `/fd3:build-spec` to start a delivery.
- `/fd3:implement-tasks <dir>` is the skill `/fd3:implement` calls. The two do the same thing.

## Each step in detail

### 1. Build the spec: `/fd3:build-spec`

Interview. Before it asks anything, Claude checks what your idea or plan claims against the
repository, its existing specs and decision records, and the library versions your lockfile
resolves. Round 1 opens with every place the plan turned out to be wrong. Then Claude asks in
rounds: every question it can ask now without guessing your answer to another, numbered, each with
two or three options, their costs, and a recommendation. Answer by number; the next round follows
from your answers. Sub-agents look up facts; the decisions stay yours. The interview ends when
nothing is left to decide and you confirm the closing summary. That summary lists, separately, any
decision Claude made that you did not answer directly. If you end the session without confirming,
fd3 stops there.

Write. A sub-agent writes the spec from the confirmed notes, in the place your repository keeps its
specs or design docs. When the repository has no such place, the last interview round asks where.
The spec follows a twelve-section template: decisions, target architecture with a code for every
piece to build (`DB-1`, `API-2`), the work per repository, rollout phases, verification, and an
evidence table that backs each claim. Anything the interview could not settle goes in as a declared
gap with an owner.

Validate. A second sub-agent runs twelve checks over the spec and re-checks its evidence against the
code. It corrects what a fact settles, such as a stale `file:line` reference, and asks you only for
facts it cannot look up or for choices that would change the scope. It then appends a dated
evidence block to the spec, opened by a verdict line such as:

```
Verdict: ready — claims: 31 verified / 2 deferred / 0 blocked — spec 412 lines at this verdict
Checked at: origin @ 4f2a9c1
```

`build-spec` runs another pass while the verdict is `not ready` and a pass could still close what
remains, or while the last pass edited the spec, up to three passes. If the spec changes after the
final verdict, for example when it is moved, `build-spec` runs one more pass on those edits.

The questions that writing and validation ask, like the ones `split-to-tasks` and
`/fd3:implement` ask, arrive as multiple-choice prompts in batches of up to four, with the
recommended option first. Only the interview asks in prose rounds.

### 2. Split into tasks: `/fd3:split-to-tasks`

The split checks the spec's last verdict line first. When that line is missing, is not `ready`,
counts a blocked claim, or gives a line count that no longer matches the file, the split asks
whether to validate first (recommended) or split anyway. Choosing to validate ends the split and
names the route, `/fd3:build-spec <spec path>`. When `origin` has since changed a file the spec
cites, the split stops and names the same route. It never edits the spec.

It then cuts the work into tasks. A task never spans two repositories, two rollout phases, or two
owning teams in a monorepo. Tasks group onto branches: by default one branch per repository per
landing unit, and one pull request per branch. A path that needs an outside approval, such as one
`CODEOWNERS` assigns to another team, gets its own branch. A later landing unit's branch stacks on
the earlier one. The split asks its few judgment calls in one batch, for example whether to replace
an existing `tasks/` directory, then writes the task files and a report.

A task file holds frontmatter (repository, branch, its base branch, phase, dependencies, status)
and pointers into the spec by element code and section. It does not copy spec content.

### 3. Implement: `/fd3:implement`

Claude reads the task files, fetches every repository, and asks one batch of questions: whether to
run code review, which base branch to start from when your checkout sits on a feature branch, and
anything the task files leave unresolved. Then it starts the `implement-run` workflow in the
background.

- Waves. Every task whose dependencies are finished runs at once, each by its own agent in its own
  worktree on a `task/<slug>` branch. At the end of a wave the task branches are merged into their
  target branch.
- Checks, one branch at a time. A sub-agent works out how the repository is checked (build,
  typecheck, lint, test), and the full set runs once on the untouched base so that failures already
  there are not blamed on your branch. Each branch then runs the checks scoped to its changes, gets
  up to three fix rounds, and finishes with one full run.
- Review (optional). After the checks pass, the `code-review` plugin reviews the branch with one
  agent per active lens, six to eight. High and medium findings rated safe or structural are fixed
  automatically, and the fixes are reviewed again. Security and spec findings, findings in code the
  branch did not touch, findings rated report-only, and anything the fixer left unfixed come to
  you. `nit` findings, the lowest severity, are reported and never applied.

When the run ends you get its report: task statuses, check and review results per branch, notes the
agents flagged, and the list of human-in-the-loop (HIL) items, meaning everything only a person can
settle: a manual step against a live system, a blocker an agent would not guess past, a merge
conflict, a check that would not pass. You decide each item. Claude then either restarts
`implement-run` for tasks your decision unblocked, or starts `repair-run` to apply your decision to
an existing branch. This repeats until every task is `done` or you stop.

Finally Claude proposes the pull requests: one per branch, with its base branch, worktree path,
tasks and title. It pushes and runs `gh pr create` only after you agree. Removing the worktrees is a
separate question.

## Files fd3 writes

| Path | Written by | What it is |
|---|---|---|
| `<spec>.md` | build-spec | The spec. Each validation pass appends a dated evidence block and verdict line at the end. |
| `<spec>.notes.md` | build-spec | The confirmed interview decisions, moved out of the scratch directory. |
| `<spec>.research/` | build-spec | The research reports the interview relied on. |
| `evidence/<section>.md` | build-spec | Evidence too long for a table cell, next to the spec. |
| `tasks/NNNN-<slug>.md` | split-to-tasks | One file per task, next to the spec unless you name another directory. Its `status:` field is the run's state; keep the directory until the run is over. |
| `<spec>.split.md` | split-to-tasks | The task table, the branch order per repository, and the coverage check. |
| `<repo>.worktrees/<name>/` | implement | The worktrees, created beside the repository, not inside it. |
| `<repo>.worktrees/.review/` | implement | The code-review working files and a `report.md` per branch and pass. |
| `HIL_ACTIONS.md` | implement, when you accept the offer | The human steps in order, next to the tasks directory, for a run that waits days on people. |

Until the spec is written, the interview keeps its working files (`notes/question-ledger.md`,
`research/`) in the session's scratch directory.

Branches: one `task/<slug>` per task, plus the target branches named in the task files.

## What fd3 will not do

- Push or open pull requests without your explicit yes.
- Change the spec during the split or the implementation. A defect found there stops the step and
  is reported.
- Run two workflows at once. Only one `implement-run` or `repair-run` runs at a time, so only one
  build, lint and test pipeline runs on the machine.
- Mark a branch `done` when its review did not run or left findings for you. It stays `merged`.

## Internal parts

You do not call these. They are listed so you recognise them in the `/` menu and in run output.

| Name | Kind | Role |
|---|---|---|
| `write-spec` | skill, hidden from the `/` menu | Writes the spec from the interview notes. `build-spec` starts it. |
| `validate-spec` | skill, hidden from the `/` menu | Checks the spec and appends the verdict. `build-spec` starts it. |
| `implement-run` | workflow | Waves, merges, checks and review. It appears in the `/` menu as `/fd3:implement-run`; do not run it directly. |
| `repair-run` | workflow | Applies your HIL decisions to existing branches and checks them again. It appears in the `/` menu as `/fd3:repair-run`; do not run it directly. |
| `fd3:researcher` | sub-agent | Looks up documentation and other external facts. |
| `fd3:toolchain-scout` | sub-agent | Finds a repository's build, typecheck, lint and test commands. |

## Example

A typical sequence; the paths are examples.

```
/fd3:build-spec our retry strategy for the payment webhook
/fd3:split-to-tasks docs/specs/webhook-retries.md
/fd3:implement docs/specs/tasks
```

An interview question looks like this:

```
3. Where should retry state live? Today the worker keeps it in memory, so a pod restart
   loses the count and the job starts its retries from zero.
   - a) Redis, alongside the job queue — state survives restarts and is visible across
     workers; the cost is one more thing Redis has to stay up for. Recommended: the
     queue already runs on Redis, so this adds no new dependency to operate.
   - b) A column on the jobs table — no new infrastructure, but every retry becomes a
     write to what is already the busiest table in the system.
```

## Glossary

- Spec: the design document fd3 writes and checks. Every later step reads the spec, not the
  conversation.
- Element, element code: one thing the spec says will be built (a table, an endpoint, a job), with
  a permanent code such as `DB-1`. Tasks and checks refer to elements by code.
- Declared gap: something the spec could not settle, written down with who resolves it and where
  it blocks. It does not block validation; the split turns it into a task for that owner.
- Verdict: the line validation appends. `ready` means every claim is verified or is a declared gap
  with an owner.
- Rollout phase, gate: the spec orders the work into phases. A gate is a point where something
  outside the code has to happen before work continues, such as a deploy, a waiting period, or an
  approval.
- Landing unit: the consecutive phases up to and including a gate. Its tasks in one repository
  share a branch, which becomes one pull request.
- Stacked branches: a later landing unit's branch starts from the earlier one's, so its pull
  request targets that branch until the earlier one merges.
- Task: the smallest piece of work that can be checked on its own and leaves the repository
  mergeable. One task, one worktree.
- Operational task: a step done by hand against a live system, such as a console action or a CLI
  sequence, with no pull request. fd3 lists it; you do it and confirm.
- Wave: one round of parallel implementation, covering every task whose dependencies are finished.
- HIL item (human in the loop): anything the run stopped on because only a person can decide it or
  do it.
- Task statuses: `todo`; `in-progress`; `implemented` (code on the task's own branch); `merged`
  (code on the target branch, waiting for checks and review); `blocked` (needs a person); `done`
  (the branch passed its final checks with nothing left for you).
- Lens: one focus of the code review, such as security, performance or spec conformance. Each
  active lens is one review agent.
- Boy-scout finding: a review finding about code the branch did not change. fd3 never fixes these
  automatically.

## Relationship to `feature-delivery`

fd3 covers the same ground as the [`feature-delivery`](../feature-delivery) plugin, rebuilt around
skills and dynamic workflows. The two share no commands or file formats, so use one or the other
for a given piece of work.
