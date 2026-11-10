---
title: Introduction
description: What cc-toolkit is, how its plugins fit together, and where to start.
---

cc-toolkit is a set of plugins for [Claude Code](https://code.claude.com/docs), Anthropic's coding agent for the terminal and IDE. Each plugin solves one problem, such as reviewing a change, turning an idea into a spec, or fixing a failed CI run. Each one works on its own.

## Plugins and marketplaces

A plugin adds commands, skills, helper agents, or hooks to Claude Code. A marketplace is a catalog of plugins. You add the cc-toolkit marketplace to Claude Code once, then install only the plugins you want from it.

You invoke a plugin's commands and skills as `/<plugin>:<name>`, for example `/code-review:start-cr`. Many skills also start on their own when your request matches, for example when you paste a link to a failed CI run.

## How the plugins fit together

The plugins follow the path of a change from idea to merge:

| Stage | Plugins |
|---|---|
| Plan and specify | [fd3](/plugins/fd3/) turns an idea into a spec and then into code. [codex-plan-improver](/plugins/codex-plan-improver/) gets a second opinion on Claude's plans. [researcher](/plugins/researcher/) answers research questions with cited sources. |
| Build and ship | [dev-kit](/plugins/dev-kit/) opens pull requests, fixes failed CI runs, and checks dependency upgrades. [tester](/plugins/tester/) checks a running app. [pr-proof](/plugins/pr-proof/) records a video that shows a change works. |
| Review | [code-review](/plugins/code-review/) reviews a change from several angles at once and merges the results into one report. |
| Agent hygiene | [hookify](/plugins/hookify/) stops Claude from repeating a mistake. [session-learner](/plugins/session-learner/) turns your corrections into project rules. |
| Media and naming | [scribe](/plugins/scribe/) transcribes and summarizes audio and video. [namesmith](/plugins/namesmith/) suggests names and checks domains. |

You don't need the whole set. Start with the plugin that matches the problem you have now.

## Next steps

- [Install the marketplace and your first plugin](/getting-started/installation/).
- Read the page of the plugin you want to try.
