# cc-toolkit

Plugins for [Claude Code](https://code.claude.com/docs), Anthropic's coding agent for the terminal and IDE.

A plugin adds commands, skills, helper agents, or hooks to Claude Code. This repository is a plugin
marketplace: a catalog you add to Claude Code once, then install only the plugins you want from it.
Each plugin solves one problem, such as reviewing a change, turning an idea into a spec and then into
code, or fixing a failed CI run, and works on its own.

## Install

Claude Code must already be installed. In a Claude Code session, add the marketplace once:

```
/plugin marketplace add grixu/cc-toolkit
```

Then install a plugin by name:

```
/plugin install code-review@cc-toolkit
```

This opens the plugin's details. Review what it adds, then choose a scope:

- User: you get it in every project on this machine.
- Project: it is enabled for everyone working in this repository (written to `.claude/settings.json`).
- Local: you get it in this repository only.

To check that it worked, type `/` and look for entries that start with the plugin name, such as
`/code-review:start-cr`. Run `/plugin` with no arguments to browse every plugin in the marketplace.

From your shell, without opening a session:

```
claude plugin marketplace add grixu/cc-toolkit
claude plugin install code-review@cc-toolkit
```

The shell install uses user scope; pass `--scope project` or `--scope local` to change it. Plugins
installed this way load the next time you start Claude Code, or after `/reload-plugins` in an open
session.

### Updates

Auto-update is off by default for third-party marketplaces like this one. To update, run `/plugin`,
open the Marketplaces tab, select `cc-toolkit`, and choose Update marketplace. On the same tab you can
turn on auto-update. To update one plugin from your shell, run `claude plugin update <plugin>@cc-toolkit`.

### OpenAI Codex CLI

code-review also installs in the [OpenAI Codex CLI](https://github.com/openai/codex):

```
codex plugin marketplace add grixu/cc-toolkit
codex plugin add code-review@cc-toolkit
```

Start it with `$code-review:start-cr`. Its [README](plugins/code-review/README.md#codex) covers
usage and the limits under Codex. Only code-review ships Codex adapters: Codex lists the
marketplace's other plugins too, but they are not supported there.

## Plugins

Every plugin is invoked as `/<plugin>:<name>`. Many also start on their own when your request matches,
for example when you paste a failed CI link. Each plugin's README covers usage and options.

### Plan and build features

| Plugin | What it does | Start with |
|---|---|---|
| [fd3](plugins/fd3/README.md) | Turns a rough idea into working code in stages. Claude questions you until the design decisions are settled, writes them up as a spec, checks the spec against your code, splits it into tasks, then implements the tasks in parallel in separate git worktrees and validates the result. Nothing is pushed without your approval. | `/fd3:build-spec <topic>` |
| [collegium](plugins/collegium/README.md) | Hands a task to another coding agent and model, such as OpenAI Codex, while you keep working, and shows its result when it ends: a summary, the answer, and the assumptions and open questions it had. Codex reads your checkout without changing it, or writes in a git worktree, a branch or a merge when you ask. Codex stays off until you turn it on. | `/collegium:run <task>` |
| [codex-plan-improver](plugins/codex-plan-improver/README.md) | Gets a second opinion on Claude's plans. When you leave plan mode, it sends the plan to OpenAI Codex and revises it until Codex approves, for up to 5 rounds. | Runs on leaving plan mode, or `/codex-plan-improver:codex-review` |

### Review and test code

| Plugin | What it does | Start with |
|---|---|---|
| [code-review](plugins/code-review/README.md) | Reviews your branch's changes from several angles at once (comments, readability and tests, naming, structure, simplicity, correctness, security, agreement between code and its docs, contracts and config, assumptions about dependencies and the platform, performance, and conformance to a spec) and merges the results into one report per file. Changes nothing until you pick which fixes to apply. | `/code-review:start-cr` |
| [tester](plugins/tester/README.md) | Checks that a running app behaves as intended. It finds the local stack, derives checks from a spec or from your git diff, and runs them against the API, the UI in a browser, and failure cases such as a stopped dependency. Returns a pass/fail table with evidence for each check. | `/tester:run [spec or scope]` |
| [pr-proof](plugins/pr-proof/README.md) | Shows that a pull request's change works. It decides which proof the branch needs, then produces it: a narrated video against your running app, screenshots at the project's breakpoints, or a terminal or API transcript with secrets masked. `/dev-kit:pr-open` puts the proof in the pull request. | `/pr-proof:prepare-proof` |
| [code-story](plugins/code-story/README.md) | Explains a branch, a pull request or a stack of them as a chaptered page for a reader who has never seen the code: one question per chapter, notes pinned to the lines they explain, diagrams, and an optional second language. Publishes it as a private claude.ai page and updates it under the same link. | `/code-story:code-story` |
| [hookify](plugins/hookify/README.md) | Stops Claude from repeating a mistake. Describe the behavior, such as "warn me before `rm -rf`", and it writes a rule that blocks or warns when it happens again. | `/hookify:hookify <behavior>` |

### Everyday git and CI chores

| Plugin | What it does | Start with |
|---|---|---|
| [dev-kit](plugins/dev-kit/README.md) | Five small skills: fix a failed CI run at its root cause; keep fixing a pull request until CI is green and review comments are resolved; check whether a dependency upgrade breaks your code; open a pull request filled in from the repository's template, with the branch's proof, a code story and a risk label; merge the base into your branch and resolve the conflicts. | `/dev-kit:ci-fix <run URL>`, `/dev-kit:pr-shepherd`, `/dev-kit:dep-upgrade-check <package>@<version>`, `/dev-kit:pr-open`, `/dev-kit:merge-in-head` |

### Research and writing

| Plugin | What it does | Start with |
|---|---|---|
| [researcher](plugins/researcher/README.md) | Answers a research question with an HTML report in which every claim links to a numbered source. Follow-up questions extend the same report. | `/researcher:research "<question>"` |
| [anti-slop](plugins/anti-slop/README.md) | Rewrites English or Polish prose so it reads plain and human: common words over rare exact ones, no staged contrasts, closers or forced lists of three, and no claim the source does not back. Every fact, number and caveat stays. code-story and dev-kit run it on what they write. | `/anti-slop:anti-slop <file or text>` |

### Improve Claude Code itself

| Plugin | What it does | Start with |
|---|---|---|
| [stop-sound](plugins/stop-sound/README.md) | Chimes when Claude waits for you: when it finishes a turn and when it asks a question. Silent while subagents work. | Runs on its own once installed |
| [jev-skill-suggestion](plugins/jev-skill-suggestion/README.md) | Saves context when many skills are installed by showing Claude only the skill that fits each prompt, not every skill's description. Any skill still runs when you type /name. | `/jev-skill-suggestion:setup`, then it runs on its own |
| [fast-jev-compaction](plugins/fast-jev-compaction/README.md) | Compacts sessions early by removing the tool calls and outputs Claude no longer needs, keeping your messages and Claude's replies word for word. Needs an API key; without one, or when that frees too little space, the usual summary runs. | Runs on its own once installed |

## Requirements

Most plugins need only Claude Code. These need more:

| Plugin | Needs |
|---|---|
| codex-plan-improver | [OpenAI Codex CLI](https://github.com/openai/codex), `jq` |
| code-review | Python 3, git |
| collegium | Claude Code 2.1.327 or later; [OpenAI Codex CLI](https://github.com/openai/codex) |
| hookify | Python 3 |
| fd3 | git; [dynamic workflows](https://code.claude.com/docs/en/workflows) for `/fd3:implement`; code-review 0.4.0 or later for its optional review step |
| researcher | [Dynamic workflows](https://code.claude.com/docs/en/workflows); the [firecrawl](https://www.firecrawl.dev) MCP server with `FIRECRAWL_API_KEY`; optional `mmdc` for diagrams |
| tester | A running, non-production app; optional [`agent-browser`](https://github.com/vercel-labs/agent-browser) for UI checks; Docker for one failure-injection mode |
| dev-kit | git, the GitHub CLI (`gh`); installs code-story and anti-slop with it |
| code-story | Node.js 22 or later, git, `gh`; installs anti-slop with it |
| anti-slop | Node.js 22 or later for its scan script |
| pr-proof | A web app that runs locally; Node.js 22.18 or later, `pnpm`, `ffmpeg` with libass, `timeout` (coreutils on macOS), `gh` 2.103 or later |
| jev-skill-suggestion | Claude Code 2.1.278 or later; optional `TYPESAFE_API_KEY`, `GEMINI_DECISIONS_API_KEY` or `GEMINI_API_KEY` (without one, Claude Code's small model picks the skill) |
| fast-jev-compaction | `TYPESAFE_API_KEY`, or `GEMINI_DECISIONS_API_KEY` or `GEMINI_API_KEY` (without one, Claude Code's own summary runs) |

Dynamic workflows are available on paid plans and with Anthropic API access. On Pro, turn them on
in the Dynamic workflows row of `/config`.

## Renamed and removed plugins

- `scribe` (formerly `yt`) moved to its own marketplace, [grixu/cc-leaner](https://github.com/grixu/cc-leaner):
  `/plugin marketplace add grixu/cc-leaner`, then `/plugin install scribe@cc-leaner`.
- `comment-review` and `quality-review` were replaced by `code-review` and are no longer published.
  Uninstall them if you still have them, or you will see duplicate skill names.
- `feature-delivery` was replaced by `fd3`. The two share no file formats, so a project started in
  feature-delivery has to be specified again with `/fd3:build-spec`. Uninstall it if you still
  have it.
- `namesmith` and `session-learner` were removed. None of these plugins is published any more.

## Contributing

Each plugin lives in `plugins/<name>/` with `.claude-plugin/plugin.json`, a `README.md`, and a
`CHANGELOG.md` (Keep a Changelog, with an `[Unreleased]` section). `.claude-plugin/marketplace.json`
lists every plugin.

- Commits use conventional commits with the plugin as scope: `feat(hookify): ...`, `fix(fd3): ...`.
- Release with `./scripts/release.sh <plugin> <patch|minor|major>`. It bumps the version in
  `plugin.json` (and `.codex-plugin/plugin.json` where one exists) and `marketplace.json`, stamps
  the changelog, commits, and tags the release. It needs `jq` and `git`; `gh` is optional.
- Eval suites (promptfoo) run with `pnpm install && pnpm eval`, or `scripts/run-evals.sh <plugin>` for
  one plugin.
- `hookify` is forked from `anthropics/claude-plugins-official`. Upstream changes arrive on the
  `hookify-upstream` branch via `scripts/sync-hookify.sh`.

To try a local change without installing it, start Claude Code with `claude --plugin-dir ./plugins/<name>`, adding a `--plugin-dir` for each plugin it depends on (dev-kit needs code-story and anti-slop; code-story needs anti-slop).
Run `claude plugin validate .` after editing `marketplace.json`.

## License

[MIT](LICENSE)
