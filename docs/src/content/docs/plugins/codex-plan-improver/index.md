---
title: codex-plan-improver
description: Sends Claude's plan to OpenAI Codex for review when you leave plan mode, and revises it until Codex approves.
---

A plan written by one model has that model's blind spots.
codex-plan-improver gets a second opinion from OpenAI Codex before any code is written.
Claude revises the plan from Codex's feedback until Codex approves or five rounds pass.

## Install

```
/plugin install codex-plan-improver@cc-toolkit
```

It also needs the [OpenAI Codex CLI](https://github.com/openai/codex), installed and signed in, and `jq` and `uuidgen` on your `PATH`.

## What it does

| Command or skill | What it does |
|---|---|
| Plan-exit hook | Starts on its own when Claude calls `ExitPlanMode`. It denies that exit and tells Claude to run the review. The next exit goes through. |
| `/codex-plan-improver:codex-review [model]` | Sends the current plan to Codex and revises it round by round, up to five rounds. Codex runs in a read-only sandbox. |

Each round shows Codex's feedback, ending in `VERDICT: APPROVED` or `VERDICT: REVISE`, and the revisions Claude made.
Claude skips any Codex suggestion that contradicts a requirement you stated, and tells you it did so.

## Usage

- Work in plan mode as usual. When Claude leaves plan mode, the hook triggers the review, and you see the revised plan.
- Run `/codex-plan-improver:codex-review` at any point when a plan exists in the conversation. Without a plan, Claude asks what to review.
- Run `/codex-plan-improver:codex-review gpt-6-astra` to use a different model. Any model name your Codex CLI accepts for `codex exec -m` works.

## Options

| Setting | Default | Effect |
|---|---|---|
| Command argument | `gpt-6.1-sol` | The model passed to `codex exec -m`. The `model` setting in `~/.codex/config.toml` doesn't apply. |
| `CC_TOOLKIT_CODEX_PLAN_REVIEW` | Unset (review on) | Any value other than `1` or `true` turns the plan-exit hook off. The manual command still works. |

The [plugin README](https://github.com/grixu/cc-toolkit/blob/main/plugins/codex-plan-improver/README.md) has every option.
