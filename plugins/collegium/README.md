# collegium

Hands a task to another coding agent, such as OpenAI Codex, while you keep working, and brings back its answer with the assumptions and open questions it had. Codex is off until you turn it on, because each run sends your code to OpenAI.

You give Collegium a task, a skill to follow, or a question. It starts Codex in the background,
lets you keep working, and tells the session when Codex is done. The result comes back as an
envelope: a status, a summary, the answer, and the assumptions and open questions Codex had. Codex
reads your checkout without changing it, unless you ask it to write, and then it writes in a git
worktree of its own.

## Requirements

- Claude Code 2.1.327 or later, with mods turned on. Collegium reads its data folder through
  `$.process.hookEnv()`, which older versions lack. On a Team or Enterprise plan, an admin setting
  such as `allowManagedModsOnly` can turn off mods that you install.
- The [OpenAI Codex CLI](https://github.com/openai/codex) on your `PATH`; tested with 0.169.0.
  Sign in with `codex login`.
- git, for the write modes.

## Installation

```
/plugin marketplace add grixu/cc-toolkit
/plugin install collegium@cc-toolkit
```

## Enabling Codex

Codex is off by default. Turn it on with `/plugin configure collegium`. Turning it on sends the task and the code Codex reads to OpenAI.

Until you do, every run stops before it starts and says `Codex detected, enable it in /plugin
configure.` A harness listed in `harnesses.disabled` in a config file (see below) stays off even
when the switch is on; a config file can turn a harness off, never on.

### What leaves your machine

- **To OpenAI**, on every run: the task, the skill file when you pass one, and whatever files and
  command output Codex reads in the directory it works in.
- **To the decision backend**, when Collegium picks the model or effort for you: the task text and
  the list of models. That is TypeSafe or Gemini when you set one of their keys (see
  [Choosing the model and effort](#choosing-the-model-and-effort)), otherwise Claude Haiku through
  your Claude Code session.

Pass both `--model` and `--effort` and nothing goes to a decision backend.

## Usage

### `/collegium:run`

```
/collegium:run [--harness h] [--model provider/model] [--effort e] [--write worktree|branch|merge] [--skill <path>] [--wait] <task>
```

Examples:

```
/collegium:run Review the error handling in src/sync/ and list the paths that swallow errors
/collegium:run --model openai/gpt-6.1-sol --effort high --write branch Port the retry helper to the new HTTP client
/collegium:run --skill .claude/skills/audit/SKILL.md src/payments
```

The skill starts the run, prints its id with the model and effort chosen, and ends its turn. Keep
working; when Codex finishes, Collegium posts `Collegium run <id> finished: <state>.` into the
session, and Claude fetches and shows the envelope. Claude presents it as Codex's work and does not
act on it unless you ask.

- `--harness`: the agent to run on. Only `codex` exists today, and it is the default.
- `--model`, `--effort`: fix the model (`openai/<slug>`) or the reasoning effort. Leave either out
  and Collegium chooses it.
- `--write`: let Codex change files (see [Write modes](#write-modes)). Without it, Codex runs
  read-only on your checkout.
- `--skill <path>`: Codex reads that `SKILL.md` and follows it, with the task as its arguments.
- `--wait`: Claude does not end its turn after the launch; it waits up to ten minutes at a time
  until the run ends, then shows the envelope. Use it in a headless `claude -p` session, which
  exits when its turn ends and would take the run down with it.

A run that cannot start says why and how to fix it: Codex not installed, not enabled, logged out
(`! codex login`), an unknown model or effort, or a broken config file.

A run gets 60 minutes before Codex is killed and the run ends as `timeout`. The run's files live
next to your repository, in `<repo>.collegium/<id>/`, and are removed once the result is delivered.

### Write modes

| Mode | What Codex writes to | What you get back |
|---|---|---|
| none (default) | nothing: read-only on your checkout | the envelope |
| `worktree` | a detached git worktree of its own | the worktree's path, kept for you to inspect |
| `branch` | a worktree on branch `collegium/<id>`, committed and removed when Codex ends | the branch and its diffstat |
| `merge` | as `branch`, then merged into your checkout | the branch and its diffstat; `conflict` when the merge fails |

A `merge` run that conflicts aborts the merge and keeps the branch for you to merge. It also leaves
the branch unmerged when a merge of yours is already in progress, or when git refuses to merge over
your uncommitted changes.

A write-mode run that does not end `done` is neither committed nor merged, so half-done work never
reaches your checkout. A `worktree` run keeps its worktree as Codex left it; a `branch` or `merge`
run leaves its branch as it started. The result's `note` says which.

### `/collegium:config`

Sets which model each tier uses and which models Collegium never picks. It runs `codex --version`,
`codex login status` and `codex debug models`, shows Codex's models with the hidden ones marked, asks
whether to write the user or the project file, asks for the tier mapping and the exclusions, and
writes the file. It ends by saying whether Codex is enabled.

## Choosing the model and effort

Without `--model`, Collegium picks among the models you mapped to tiers (`high`, `medium`, `low`)
or, with no mapping, among every model Codex lists that is not hidden or excluded. Without
`--effort`, it picks among the efforts the model supports. The launch line says who chose:
`caller`, `typesafe`, `gemini` or `haiku`.

The decision backend is set by `decision.backend` in the config file:

| `decision.backend` | Backend |
|---|---|
| `auto` (default) | TypeSafe when `TYPESAFE_API_KEY` is set, else Gemini when `GEMINI_DECISIONS_API_KEY` or `GEMINI_API_KEY` is set |
| `typesafe`, `gemini` | that backend; its key must be set |

With no key, or when the backend fails or answers outside the list, Collegium asks Claude Haiku.
When Haiku gives no usable answer either, Codex runs with its own default model and effort.

## Configuration file

Two JSON files, both optional. The project file overrides the user file field by field.

- **User**: `config.json` in the plugin's data folder (`${CLAUDE_PLUGIN_DATA}`). `/collegium:config`
  writes it there; the folder's name differs between a marketplace install and `--plugin-dir`.
- **Project**: `.claude/collegium.json` in the project.

```json
{
  "harnesses": {
    "order": ["codex"],
    "disabled": [],
    "codex": {
      "palettes": {
        "openai": {
          "tiers": { "high": "openai/<slug>", "medium": "openai/<slug>", "low": "openai/<slug>" },
          "exclude": ["openai/<slug>"]
        }
      }
    }
  },
  "decision": { "backend": "auto" }
}
```

| Field | Meaning | Merge |
|---|---|---|
| `harnesses.order` | the harness a run uses when `--harness` is not given: the first enabled one | project replaces user |
| `harnesses.disabled` | harnesses turned off | union of both files |
| `harnesses.<id>.palettes.<provider>.tiers` | `high`, `medium`, `low` → a `provider/model` id | per tier, project wins |
| `harnesses.<id>.palettes.<provider>.exclude` | models never picked | project replaces user |
| `decision.backend` | `auto`, `typesafe` or `gemini` | project wins |

A model mapped to a tier is kept even when it is hidden or excluded. Any other field, or a value of
the wrong shape, is an error naming the file and the field, and no run starts until it is fixed.

## Tools

The skill drives three tools, which other plugins and your own prompts can call too. They are
deferred: load them with `ToolSearch` (`select:mcp__collegium__collegium_run,mcp__collegium__collegium_status,mcp__collegium__collegium_result`).

### `mcp__collegium__collegium_run`

Starts a run and returns at once.

| Input | Meaning |
|---|---|
| `task` (required) | what to do, or the skill's arguments when `skill` is given |
| `skill` | absolute path of a `SKILL.md` to read and follow |
| `harness` | `codex` |
| `model`, `effort` | `provider/model` and an effort it supports; chosen when left out |
| `write` | `worktree`, `branch` or `merge` |
| `cwd` | absolute directory Codex works in; default the session's git top level |
| `result_schema` | a strict JSON Schema for the envelope's `result` |
| `timeout_minutes` | at least 1; default 60 |

Returns `{ id, harness, model, effort, chosenBy, mode, runDir }`, or, before launch, an error string
that names the fix. When the main session started the run, Collegium posts `Collegium run <id>
finished: <state>. Call collegium_result.` into it when the run ends. A run a subagent starts posts
no notice: the subagent waits for it with `collegium_result`.

### `mcp__collegium__collegium_status`

Input `{ id }`. Returns the state, elapsed time and deadline in seconds, the model and effort, and
Codex's last three messages and last five commands.

### `mcp__collegium__collegium_result`

Input `{ id, wait_seconds? }`. With `wait_seconds` (at most 600) it waits that long for the run to
end; a run still going returns `{ id, state: "running", elapsedSec }`, so call again. An ended run
returns `{ id, state, envelope?, branch?, diffstat?, worktree?, reason?, note? }` and its run
directory is removed, so a second call answers "unknown id".

`state` is `done`, `blocked`, `failed`, `timeout` or `conflict`. The envelope:

| Field | Meaning |
|---|---|
| `status` | `done`, `blocked` or `failed` |
| `summary` | what Codex did, or why it is blocked |
| `result` | the answer: a string (or `null`), or JSON matching `result_schema` |
| `assumptions` | the choices Codex made where the task was unclear, since nobody answers its questions |
| `open_questions` | what Codex could not settle |

A `failed` run without an envelope carries a `reason`: a launch error, the process ending without a
readable final message, or the session that started it closing before it ended.
