---
title: Reference
description: The requirements, the command argument, the setting that turns the hook off, and the files codex-plan-improver writes.
group: reference
sidebar:
  order: 2
---

## Requirements

| Requirement | Why |
|---|---|
| [OpenAI Codex CLI](https://github.com/openai/codex), signed in with `codex login` or an API key in the environment | The command runs `codex exec` for each round. |
| `jq` on `PATH` | The hook reads the session ID from its input and writes its answer with `jq`. |
| `uuidgen` on `PATH` | The command makes a short review ID for its temporary files. |
| A writable `/tmp` | The plan, each review, and the hook's flag file are written there. |

Table 1. What codex-plan-improver needs on your machine.

## Command

```
/codex-plan-improver:codex-review [model]
```

| Argument | Default | Effect |
|---|---|---|
| `model` | `gpt-6.1-sol` | The model passed to `codex exec -m`. Any name your Codex CLI accepts works. The `model` setting in `~/.codex/config.toml` doesn't apply. |

Table 2. The command's only argument.

The command always runs Codex with `-s read-only`, so Codex can read your repository but can't change files.
A review stops after five rounds.
Neither is configurable.

## Environment variable

| Variable | Default | Effect |
|---|---|---|
| `CC_TOOLKIT_CODEX_PLAN_REVIEW` | Unset (review on) | `1` or `true` keeps the plan-exit hook on. Any other value turns it off. The manual command still works. |

Table 3. The setting that turns the automatic review off.

## Hook

| Event | Matcher | Timeout | Answer |
|---|---|---|---|
| `PreToolUse` | `ExitPlanMode` | 10 seconds | Alternates per session: denies an exit with a reason that tells Claude to run the review, then lets the next exit through. |

Table 4. The plan-exit hook.

## Files written

| File | Written by | Removed |
|---|---|---|
| `/tmp/claude-plan-<id>.md` | The command: the plan, rewritten after each revision | At the end of the review |
| `/tmp/codex-review-<id>.md` | The command: Codex's first-round review | At the end of the review |
| `/tmp/codex-plan-reviewed-<session_id>` | The hook: marks that the review was requested | On the next `ExitPlanMode` in the same session |

Table 5. Temporary files. `<id>` is eight characters from `uuidgen`, so concurrent sessions don't overwrite each other's files.

Later rounds resume the Codex session and read its answer from the command output, not from a file.
