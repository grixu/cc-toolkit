# feature-delivery

> Deprecated. For new work use [fd3](../fd3/README.md),
> which covers the same ground with skills and dynamic workflows. The two plugins share no file
> formats, so finish a feature in the plugin you started it in.

When a change is big enough that requirements, a test plan and acceptance criteria should be
settled before code is written, feature-delivery turns a one-line request into a written
specification by asking you structured questions. It then implements that specification with
parallel subagents and checks the result against the acceptance criteria.

## Requirements

- Claude Code with the Agent, AskUserQuestion and Task (TaskCreate, TaskUpdate, TaskGet,
  TaskList) tools.
- Optional: a language-server (LSP) plugin for your project's language. Codebase research uses it
  when available and falls back to text search otherwise.
- Optional: WebSearch and WebFetch, for researching external best practices. The commands work
  without them.

## Installation

```
/plugin marketplace add grixu/cc-toolkit
/plugin install feature-delivery@cc-toolkit
```

## Commands

| Command | Use it when | Example |
|---|---|---|
| `/feature-delivery:start <description>` | You have a new feature, fix or refactor and want a spec before coding. | `/feature-delivery:start add dark mode with a per-user toggle` |
| `/feature-delivery:current [id \| --all]` | You want the status of the active spec, the details of one spec, or a list of all of them. | `/feature-delivery:current --all` |
| `/feature-delivery:edit [id]` | A finished spec needs requirements added, changed, removed or clarified. | `/feature-delivery:edit dark-mode` |
| `/feature-delivery:implement [id]` | A spec is complete and you want it built. | `/feature-delivery:implement` |

Without an `id`, `current`, `edit` and `implement` act on the active requirement: the one you
started last.

### start: build a specification

1. Rates the request's complexity from 1 to 6. The rating sets how many questions you get.
2. Asks discovery questions one at a time, then up to 3 follow-ups.
3. Researches the codebase on its own.
4. Asks technical questions one at a time, then up to 3 follow-ups.
5. Proposes automated and manual test plans. You deselect what you don't want.
6. Writes the requirements specification: functional and technical requirements, test plan,
   acceptance criteria, and assumptions marked `ASSUMED:`.

`start` writes no code. If you ask it to "just implement it", it steers you back to the spec.
Each run creates a new requirement; `start` does not resume an interrupted one.

### edit: revise a specification

Asks whether you want to add, modify, remove or clarify requirements, and what the change is. It
then runs the same cycle on the change: complexity re-assessment, discovery questions, codebase
research, technical questions and test-plan review. The result is a new full version of the
specification, not a diff.

### implement: build from the specification

1. Loads the latest spec version and checks that it has functional requirements, technical
   requirements and acceptance criteria.
2. Discovers project conventions (`AGENTS.md`, `CLAUDE.md`, existing code) and the lint, test
   and build commands.
3. Splits the spec into tasks with dependencies and shows you the plan for approval.
4. Runs unblocked tasks in parallel, up to 5 subagents at a time. A task goes to a project agent
   that matches its stack (for example `backend` or `frontend`) when one exists, and to
   `general-purpose` otherwise.
5. Checks acceptance criteria, code quality and integration, then asks how to handle any gaps.
6. Runs lint, test and build in that order, retrying each up to 3 times before asking you.
7. Writes an implementation report.

`implement` edits files in your current working tree. It creates no branches or worktrees and
makes no commits.

## Where files go

Everything is stored outside your repository:

```
~/.claude/grixu-cc-toolkit/feature-delivery/<project>/
  .current-requirement                  # the active requirement
  2026-03-17-1420-dark-mode/
    01-request-and-complexity.md
    02-discovery-qa.md
    03-codebase-research.md
    04-technical-qa.md
    05-test-plan.md
    06-requirements-spec.md             # the spec
    07-edit-1-request.md ...            # added by edit
    13-requirements-spec-v2.md          # the spec after the first edit
    NN-implementation-report.md         # added by implement
    metadata.json
```

`<project>` is the name of the directory you run Claude Code from, lower-cased, with every
character outside `a-z0-9-` replaced by `-` (`My_App.v2` becomes `my-app-v2`). Two projects whose
directory names map to the same slug share a folder. Specs are not in your repository, so teammates do not see
them and git does not track them.
