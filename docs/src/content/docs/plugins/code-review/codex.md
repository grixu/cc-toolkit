---
title: Run it in Codex CLI
description: Install code-review in the OpenAI Codex CLI, start a review with $code-review:start-cr, and see what works differently there.
group: reference
sidebar:
  label: Codex CLI
  order: 5
---

code-review also installs in the [OpenAI Codex CLI](https://github.com/openai/codex).
It is the only cc-toolkit plugin that does: Codex lists the marketplace's other plugins too, but they are not supported there.
The review runs the same lenses and the same rules as in Claude Code, with the limits below.

## Install

The plugin was tested on codex-cli 0.165.0, and needs the same `git` and `python3` as in Claude Code.
From your shell:

```sh
codex plugin marketplace add grixu/cc-toolkit   # --ref <branch> installs from a branch
codex plugin add code-review@cc-toolkit
codex plugin list                               # check that it is installed
```

To work on a local checkout of cc-toolkit, add its path as the marketplace instead.
After an edit, run `codex plugin add code-review@cc-toolkit` again, which refreshes the installed copy, and start a new session.

## Run a review

In Codex, a skill is mentioned with `$`, not `/`:

```
$code-review:start-cr [--base <ref>] [--pr <n>] [--spec <path>]
```

The arguments mean what they mean for [`/code-review:start-cr`](/plugins/code-review/reference/#arguments-of-start-cr).
`--pr` needs network access; see [Limits](#limits).

`start-cr` runs only when you mention it; Codex never starts it on its own from a request.
The [headless steps](/plugins/code-review/reference/#headless-steps) `$code-review:cr-prepare`, `cr-scan` and `cr-merge` are mention-only too, for workflows that drive them.

## How it works

Codex reads the same `.claude-plugin/marketplace.json` as Claude Code.
The plugin's `.codex-plugin/plugin.json` points Codex at `codex/skills/` instead of the Claude Code skills.

Each skill there is a thin adapter:

1. It finds the plugin root and reads `codex/host.md`.
2. `host.md` maps Claude Code's mechanics to Codex's: the plugin root, `$ARGUMENTS`, tool names, questions, sub-agents, the rule that `.env` files are read for key names only, and commits under the sandbox.
3. The adapter then follows the Claude Code command or skill unchanged.

So the lens rules have one source, and a fix to a rule reaches both hosts.

## Limits

| Area | What is different under Codex |
|---|---|
| Parallel lenses | Scanners run as Codex sub-agents, so the lenses run in waves. Six run at a time under multi-agent v1; under v2, the session's slots minus one, three by default. Codex picks the version for the model. Raise the cap with `agents.max_concurrent_threads_per_session` in `config.toml`. |
| Questions | `request_user_input` is unavailable in Default mode, so questions and the apply menu come as numbered chat messages. Answer in your next message. |
| `codex exec` | Every question, the apply menu included, stops the run, and nothing it gates is applied. Answer with `codex exec resume <id> "<answer>"`. `resume` takes no `-C` or `-s`; set the sandbox with `-c sandbox_mode=...`. |
| Commits | The `workspace-write` sandbox keeps `.git` read-only and blocks the gpg-agent socket, so a commit mode stops and asks instead of committing. |
| `--pr` | It needs network for `gh` and `git fetch`, a writable `.git`, and a writable directory beside the repository for the pull request's worktree. `workspace-write` gives none of them, and this path is untested under Codex. |
| Scanner tools | Codex has no per-agent tool list, so a Scanner gets Codex's full toolset. That it edits nothing rests on its prompt alone. |
| `/security-review`, `/code-review` | Claude Code's built-in commands don't exist in Codex and are never offered. |
| Walk decision backend | It is a Claude Code plugin option, so under Codex every structural fix in the walk is asked one at a time. |

Table 1. What works differently under Codex

### Commits under the sandbox

Adding `<repo>/.git` to `sandbox_workspace_write.writable_roots` fixes only the read-only `.git`; signed commits still fail.
In an interactive run, approve running the commit outside the sandbox when Codex asks, or choose **Leave uncommitted**.
The plugin never turns off commit signing or hooks.

### The check for someone else's pull request

`start-cr` checks with `gh` whether the branch is someone else's open pull request.
When the sandbox blocks that check, the review says so in one line instead of treating it as "no pull request".
An interactive run asks to escalate the command first.

## Cost

One measurement (2026-10), as an indicative figure: a full review of a one-file change with ten lenses took 3.5–4 minutes, about 5M input tokens, about 95% of them cached, and 20k output tokens.
