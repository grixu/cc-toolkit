---
title: Reference
description: Requirements, command arguments, the files and branches fd3 writes, and the fields of a task file.
group: reference
sidebar:
  order: 7
---

## Requirements

| Needed for | Requirement |
|---|---|
| Everything | Claude Code, and a git checkout of each repository the work touches, with an `origin` remote. The interview, validation, split and implementation each run `git fetch` first. |
| Documentation lookups | The context7 and firecrawl MCP servers. fd3's research sub-agent uses them as its sources. |
| `/fd3:implement` | [Dynamic workflows](https://code.claude.com/docs/en/workflows). They are available on paid plans and with Anthropic API access. On Pro, turn them on in the Dynamic workflows row of `/config`. They are off when `disableWorkflows` is `true` or `CLAUDE_CODE_DISABLE_WORKFLOWS=1` is set. |
| Opening pull requests | The `gh` CLI, logged in. fd3 runs `gh pr create` for each branch after you agree. |
| Code review (optional) | The [code-review](/plugins/code-review/) plugin, version 0.4.0 or later. With an earlier version the review returns no verdict and the branches stay `merged`. |

Table 1. What fd3 needs

## Commands

| Command | Argument | Use it when |
|---|---|---|
| `/fd3:build-spec` | An idea or topic, or a path to a plan | You want a checked spec. |
| `/fd3:build-spec` | A path to an existing spec | The spec changed after its verdict, or the code moved on. The interview is skipped. |
| `/fd3:grill-topic` | A topic, plan, decision or idea | You want only the interview. |
| `/fd3:split-to-tasks` | A path to a spec | The spec's last verdict is `ready`. |
| `/fd3:implement` | A path to a tasks directory, or to a directory holding `tasks/` | You have task files. Run it again on the same directory to resume. |

Table 2. Commands and their arguments

`/fd3:implement-tasks` is the skill `/fd3:implement` calls, with the same argument.
No command takes flags.

## Files fd3 writes

| Path | Written by | What it is |
|---|---|---|
| `<spec>.md` | build-spec | The spec. Each validation pass appends a dated evidence block and a verdict line at the end. |
| `<spec>.session/` | build-spec | `notes.md` (the confirmed decisions), `question-ledger.md` and `research/`. A `.gitignore` of `*` keeps the folder out of git. |
| `evidence/<section>.md` | build-spec | Evidence too long for a table cell, next to the spec. |
| `tasks/NNNN-<slug>.md` | split-to-tasks | One file per task, next to the spec unless you name another directory. |
| `<spec>.split.md` | split-to-tasks | The task table, the branch order per repository, the coverage check, and what you still owe. |
| `implement-answers.md` | implement | The answers to the first question batch, later decisions, repair counts and the last report's path, next to the tasks directory. |
| `HIL_ACTIONS.md` | implement | The human steps in order, next to the tasks directory, written when a run waits on people. |
| `<repo>.worktrees/<name>/` | implement | The worktrees, created beside the repository, not inside it. |
| `<repo>.worktrees/.review/` | implement | The code-review working files and a `cr-report.md` per branch and pass. |

Table 3. Files fd3 writes

Until the spec is written, the interview keeps its working files in the session's scratch directory.
Writing the spec moves them into `<spec>.session/`.

## Branches

- One `task/<slug>` branch per task, merged into its target branch at the end of each wave.
- The target branches named in the task files' `branch` fields, one pull request each.

Cleanup at the end of a run removes the worktrees and the merged `task/<slug>` branches, after you agree.
A task branch with commits its target lacks is never removed.

## Task file fields

| Field | What it holds |
|---|---|
| `name` | A name you recognize the task by. |
| `status` | `todo`, `in-progress`, `implemented`, `merged`, `blocked` or `done`. Always `todo` after a split. |
| `spec` | The relative path to the spec. |
| `elements` | The element codes the task builds, such as `[DB-1, API-2]`. |
| `decisions` | The spec decisions the task is bound by. |
| `repository` | The absolute path of the checkout, or `none` for an operational task. |
| `branch` | The target branch, shared by every task of the landing unit. Empty for an operational task. |
| `branch-base` | The branch's stack base, the same on every task of the branch. |
| `merge-after` | Branches whose pull requests must merge first, as `<branch>` or `<repository path>:<branch>`. |
| `worktree` | Empty until the implementation run claims the task. |
| `phase` | The rollout phase from the spec, or `cleanup`. |
| `depends-on` | The slugs of tasks that must land first. |
| `tickets` | Ticket identifiers, if the spec has any. |

Table 4. Task file frontmatter

The body has three sections: `## Goal`, `## Done when` (the spec's verification rows the task must pass, by name) and `## Where to look` (pointers into the spec by element code and section).
A task may close with a `## Note` for facts about its own work, such as a shared file a dependency names or a consent you gave.
An operational task always has one, saying why no pull request exists.

## Next steps

- [How fd3 works](/plugins/fd3/how-it-works/) explains the parts and the task statuses.
- [Back to the overview](/plugins/fd3/).
