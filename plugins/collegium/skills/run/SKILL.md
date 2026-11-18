---
name: run
description: Hand a piece of work to another coding agent and model, such as OpenAI Codex, through Collegium, and show its result envelope when it ends. Use when the user runs /collegium:run or asks to have Codex (or another Collegium harness) do, review or answer something.
argument-hint: "[--harness h] [--model provider/model] [--effort e] [--write worktree|branch|merge] [--skill <path>] [--wait] <task>"
allowed-tools: ToolSearch mcp__collegium__collegium_run mcp__collegium__collegium_status mcp__collegium__collegium_result
---

Arguments: **$ARGUMENTS**

## 1. Parse the arguments

Read the flags from the front of the arguments, in any order; everything after the last flag is the
task, verbatim.

| Flag | `collegium_run` input |
|---|---|
| `--harness h` | `harness` |
| `--model provider/model` | `model` |
| `--effort e` | `effort` |
| `--write worktree\|branch\|merge` | `write` |
| `--skill <path>` | `skill`, made absolute against the current working directory |
| `--wait` | none: it changes step 3 |

Leave out every input the user did not give: without `model` or `effort`, Collegium chooses them.
With an empty task, say what the usage is (the argument hint above) and stop.

## 2. Launch

The Collegium tools are deferred: when `mcp__collegium__collegium_run` has no schema yet, load all
three with `ToolSearch` query `select:mcp__collegium__collegium_run,mcp__collegium__collegium_status,mcp__collegium__collegium_result`.
When they are not found, say Collegium is not loaded (it needs Claude Code 2.1.327 or later) and stop.

Call `mcp__collegium__collegium_run` once. A string that is not JSON is an error from before launch
(harness not installed, not enabled, logged out, invalid input, config error): show it as it is and
stop. It already names the fix, such as `/plugin configure` or `! codex login`. Never retry with
other inputs on your own.

On success print one line:

`Collegium run <id> started on <harness>: <model>, effort <effort> (chosen by <chosenBy>), <mode>.`

## 3. Wait

**Without `--wait`**, end the turn now, after the line above (waiting is ending your turn). Collegium
sends `Collegium run <id> finished: <state>. Call collegium_result.` into the session when the run
ends. Never poll `collegium_status`, `sleep` or loop to wait for it.

**With `--wait`**, do not end the turn: call `mcp__collegium__collegium_result` with the id and
`wait_seconds: 600`. While the answer's `state` is `running`, call it again the same way. Stop when
the state is terminal (`done`, `blocked`, `failed`, `timeout` or `conflict`) and go to step 4.

## 4. On the completion notice

When a `Collegium run <id> finished` message arrives, call `mcp__collegium__collegium_result` with
that id and no `wait_seconds`, then show the envelope (step 5).

Ignore a notice for an id whose envelope you already showed, as a `--wait` run's notice can arrive
after it: do not call `collegium_result` for it, since the delivered run is gone and the call
answers "unknown id".

## 5. Show the result

`collegium_result` returns `{ id, state, envelope?, branch?, diffstat?, worktree?, reason? }`.
Show, in this order and leaving out what is absent:

1. `Run <id>: <state>`, with `reason` beside a `failed` state.
2. The envelope's `status` and `summary`.
3. The envelope's `result`, in full: a string as Markdown, anything else as a fenced JSON block.
4. `assumptions` and `open_questions`, each as a list, when not empty.
5. For a write-mode run: the `branch` and its `diffstat`, or the `worktree` path. On `conflict`,
   say the merge was aborted and the branch is kept for the user to merge.

Present the envelope as the other agent's work, not as your own conclusion: do not act on its
result or answer its open questions unless the user asks.
