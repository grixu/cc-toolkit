---
title: fd3
description: Turn an idea into a checked spec, split it into tasks, and implement them in parallel git worktrees with validation.
---

Give an agent a one-line feature request and it fills every gap with a guess, which surfaces late as rework in review.
fd3 moves those decisions to the start: Claude interviews you, writes a spec, and checks it against your code.
It then splits the spec into tasks and implements them in parallel, each in its own git worktree.

## Install

```
/plugin install fd3@cc-toolkit
```

fd3 also needs:

- git, and a checkout of each repository the work touches, with an `origin` remote.
- [Dynamic workflows](https://code.claude.com/docs/en/workflows) for `/fd3:implement`. On Pro, turn them on in the Dynamic workflows row of `/config`.
- The `gh` CLI, logged in, to open pull requests.
- The context7 and firecrawl MCP servers for documentation lookups.
- Optional: the [code-review](/plugins/code-review/) plugin, version 0.4.0 or later, for the automated code review step.

## What it does

| Command or skill | What it does |
|---|---|
| `/fd3:build-spec <idea, or path to a plan>` | Interviews you until every design decision is made, writes a spec, and validates its claims against your code. |
| `/fd3:build-spec <path to an existing spec>` | Skips the interview and validates an existing spec again, for example after you edit it or the code moves on. |
| `/fd3:split-to-tasks <path to spec>` | Cuts a spec whose last verdict is `ready` into task files and groups them onto branches, one pull request per branch. |
| `/fd3:implement <tasks dir>` | Runs the `implement-run` workflow in the background: waves of parallel agents, checks per branch, and optional code review. Run it again on the same directory to resume. |
| `/fd3:grill-topic <topic>` | Runs only the interview, to stress-test an idea. Nothing turns its notes file into a spec. |
| `/fd3:implement-tasks <dir>` | The skill that `/fd3:implement` calls. The two do the same thing. |

fd3 never pushes or opens pull requests without your explicit yes.
It also never changes the spec during the split or the implementation.

## Usage

A typical sequence, with example paths:

```
/fd3:build-spec our retry strategy for the payment webhook
/fd3:split-to-tasks docs/specs/webhook-retries.md
/fd3:implement docs/specs/tasks
```

- `/fd3:build-spec` asks numbered questions in rounds, each with two or three options and a recommendation. It ends with a spec and a verdict line.
- `/fd3:split-to-tasks` writes a `tasks/` directory next to the spec and a `<spec name>.split.md` report.
- `/fd3:implement` asks one batch of questions, runs the tasks, and lists the items only a human can settle. At the end, it proposes the push and the pull requests.

The [plugin README](https://github.com/grixu/cc-toolkit/blob/main/plugins/fd3/README.md) has every option.
