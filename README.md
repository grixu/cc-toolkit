# cc-toolkit

Plugins for [Claude Code](https://code.claude.com/docs), Anthropic's coding agent for the terminal and IDE.

A plugin adds commands, skills, helper agents, or hooks to Claude Code. This repository is a plugin
marketplace: a catalog you add to Claude Code once, then install only the plugins you want from it.
Each plugin solves one problem, such as reviewing a change, turning an idea into a spec and then into
code, fixing a failed CI run, or transcribing a video, and works on its own.

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

## Plugins

Every plugin is invoked as `/<plugin>:<name>`. Many also start on their own when your request matches,
for example when you paste a failed CI link. Each plugin's README covers usage and options.

### Plan and build features

| Plugin | What it does | Start with |
|---|---|---|
| [fd3](plugins/fd3/README.md) | Turns a rough idea into working code in stages. Claude questions you until the design decisions are settled, writes them up as a spec, checks the spec against your code, splits it into tasks, then implements the tasks in parallel in separate git worktrees and validates the result. Nothing is pushed without your approval. | `/fd3:build-spec <topic>` |
| [codex-plan-improver](plugins/codex-plan-improver/README.md) | Gets a second opinion on Claude's plans. When you leave plan mode, it sends the plan to OpenAI Codex and revises it until Codex approves, for up to 5 rounds. | Runs on leaving plan mode, or `/codex-plan-improver:codex-review` |

### Review and test code

| Plugin | What it does | Start with |
|---|---|---|
| [code-review](plugins/code-review/README.md) | Reviews your branch's changes from several angles at once (comments, readability and tests, naming, structure, simplicity, security, performance, and conformance to a spec) and merges the results into one report per file. Changes nothing until you pick which fixes to apply. | `/code-review:start-cr` |
| [tester](plugins/tester/README.md) | Checks that a running app behaves as intended. It finds the local stack, derives checks from a spec or from your git diff, and runs them against the API, the UI in a browser, and failure cases such as a stopped dependency. Returns a pass/fail table with evidence for each check. | `/tester:run [spec or scope]` |
| [hookify](plugins/hookify/README.md) | Stops Claude from repeating a mistake. Describe the behavior, such as "warn me before `rm -rf`", and it writes a rule that blocks or warns when it happens again. | `/hookify:hookify <behavior>` |

### Everyday git and CI chores

| Plugin | What it does | Start with |
|---|---|---|
| [dev-kit](plugins/dev-kit/README.md) | Four small skills: fix a failed CI run at its root cause; keep fixing a pull request until CI is green and review comments are resolved; check whether a dependency upgrade breaks your code; open a pull request filled in from the repository's template. | `/dev-kit:ci-fix <run URL>`, `/dev-kit:pr-shepherd`, `/dev-kit:dep-upgrade-check <package>@<version>`, `/dev-kit:pr-open` |

### Research, media, and naming

| Plugin | What it does | Start with |
|---|---|---|
| [researcher](plugins/researcher/README.md) | Answers a research question with an HTML report in which every claim links to a numbered source. Follow-up questions extend the same report. | `/researcher:research "<question>"` |
| [scribe](plugins/scribe/README.md) | Transcribes YouTube videos or local audio and video files, then summarizes them, pulls out news on a topic, or applies your own prompt. Transcripts are cached, so asking again about the same item does not transcribe it again. | Paste a YouTube link or file path and ask for a summary |
| [namesmith](plugins/namesmith/README.md) | Suggests names for a business or product, scores each one, and checks which domains are free. | `/namesmith:namesmith <description>` |

### Improve Claude Code itself

| Plugin | What it does | Start with |
|---|---|---|
| [session-learner](plugins/session-learner/README.md) | At the end of a session, finds where you had to correct or repeat yourself and proposes updates to `CLAUDE.md` or `.claude/rules/`, so the next session starts with that knowledge. You approve each change. | `/session-learner:learn` |

### Deprecated

- [feature-delivery](plugins/feature-delivery/README.md) is deprecated; use fd3 instead. The two share
  no file formats, so finish a project in the plugin you started it with.

## Requirements

Most plugins need only Claude Code. These need more:

| Plugin | Needs |
|---|---|
| codex-plan-improver | [OpenAI Codex CLI](https://github.com/openai/codex), `jq` |
| code-review | Python 3, git |
| hookify | Python 3 |
| fd3 | git; [dynamic workflows](https://code.claude.com/docs/en/workflows) for `/fd3:implement`; code-review 0.4.0 or later for its optional review step |
| researcher | [Dynamic workflows](https://code.claude.com/docs/en/workflows); the [firecrawl](https://www.firecrawl.dev) MCP server with `FIRECRAWL_API_KEY`; optional `mmdc` for diagrams |
| scribe | Node.js 20 or later, `ffmpeg`, `ELEVENLABS_API_KEY`; `yt-dlp` for YouTube |
| tester | A running, non-production app; optional [`agent-browser`](https://github.com/vercel-labs/agent-browser) for UI checks; Docker for one failure-injection mode |
| dev-kit | git, the GitHub CLI (`gh`) |
| namesmith | Nothing to install; domain checks use a remote MCP server bundled with the plugin |

Dynamic workflows are available on paid plans and with Anthropic API access. On Pro, turn them on
in the Dynamic workflows row of `/config`.

## Renamed and removed plugins

- `yt` was renamed to `scribe`. See the [scribe changelog](plugins/scribe/CHANGELOG.md).
- `comment-review` and `quality-review` were replaced by `code-review` and are no longer published.
  Uninstall them if you still have them, or you will see duplicate skill names.

## Contributing

Each plugin lives in `plugins/<name>/` with `.claude-plugin/plugin.json`, a `README.md`, and a
`CHANGELOG.md` (Keep a Changelog, with an `[Unreleased]` section). `.claude-plugin/marketplace.json`
lists every plugin.

- Commits use conventional commits with the plugin as scope: `feat(hookify): ...`, `fix(fd3): ...`.
- Release with `./scripts/release.sh <plugin> <patch|minor|major>`. It bumps both manifests, stamps the
  changelog, commits, and tags the release. It needs `jq` and `git`; `gh` is optional.
- Eval suites (promptfoo) run with `pnpm install && pnpm eval`, or `scripts/run-evals.sh <plugin>` for
  one plugin.
- `hookify` is forked from `anthropics/claude-plugins-official`. Upstream changes arrive on the
  `hookify-upstream` branch via `scripts/sync-hookify.sh`.

To try a local change without installing it, start Claude Code with `claude --plugin-dir ./plugins/<name>`.
Run `claude plugin validate .` after editing `marketplace.json`.

## License

[MIT](LICENSE)
