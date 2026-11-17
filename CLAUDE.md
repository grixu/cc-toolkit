# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Monorepo of Claude Code plugins, published as a marketplace at `grixu/cc-toolkit`. Each plugin lives in `plugins/<name>/` with its own `plugin.json`, `CHANGELOG.md`, and `README.md`.

## Rules of Working

- Before creating a plugin or updating `.claude-plugin/marketplace.json`, check the current Claude Code docs: find the page in `https://code.claude.com/docs/llms.txt`, scrape it once as markdown to the scratchpad, then grep that file
- Show missing questions, unresolved cases, and edge cases not covered in skills, commands, or scripts

## Checks

`node scripts/verify-plugins.mjs`, `claude plugin validate <dir>` and `claude plugin test <dir>` (mod tests, written against `claude-code/testing`) run in CI (`lint.yml`); the `verify` skill runs them locally. Mod code (`hooks/*.ts`) has no tsc or tsconfig: `claude plugin validate` is its type check. Shell scripts go through ShellCheck. A PR with `fixup!` commits fails CI until they are squashed (`git rebase --autosquash origin/main`).

## Script Language Preference

When creating new scripts, prefer (in order): Bash > Node.js > Python.

## Releasing

Release only when the user asks, through the `release` skill (`.claude/skills/release/SKILL.md`): it runs `CI=true ./scripts/release.sh <plugin-name> <patch|minor|major>` from a detached worktree of `origin/main`. Never perform release steps by hand.

## Merging

`main` is protected by a required review the owner cannot give themselves. When the user says merge, run `gh pr merge <n> --merge --admin --delete-branch` without asking again.

## Commits

Use conventional commits with scope: `feat(hookify):`, `fix(codex-plan-improver):`, `chore:`, `docs:`, `ci:`, etc.

## Plugin Structure

Every plugin must have:
- `.claude-plugin/plugin.json` — name, version, description, author, repository, keywords
- `CHANGELOG.md` — Keep a Changelog format with `[Unreleased]` section
- `README.md`

Plugins may also include: `commands/`, `hooks/`, `skills/`, `agents/`, `references/`, `scripts/`, `examples/`.

A plugin may also carry `.codex-plugin/plugin.json` for the OpenAI Codex CLI (e.g., `plugins/code-review/`). `release.sh` bumps its version together with `.claude-plugin/plugin.json`, so never edit either version by hand.

The root `.claude-plugin/marketplace.json` must list every plugin with matching name, version, source path, description, author, category, and tags.

### Plugin descriptions

The `/plugin` view shows each `description`, so keep it short:
- At most two sentences, in English, identical in `plugin.json` and in the plugin's `marketplace.json` entry.
- Say what the plugin does for the user, not how it works inside: no lens lists, model names or tool chains. Detail belongs in the README.
- A deprecated plugin opens with "Deprecated — use <successor>."
- Every new or changed description goes through `/compound-writing:cw-scribe` (draft from the README), `/compound-writing:cw-reader` (cold read as a Claude Code user scanning `/plugin`) and `/compound-writing:cw-ai-check`. Repeat until reader and ai-check raise nothing that matters.

## Hookify Upstream Sync

The hookify plugin is forked from `anthropics/claude-plugins-official`. Upstream syncs go to the `hookify-upstream` branch via `scripts/sync-hookify.sh` and CI (`.github/workflows/sync-hookify.yml`). Merge conflicts may arise when local changes overlap with upstream.

## Per-Plugin Conventions

Plugins with complex conventions get a path-scoped rule in `.claude/rules/<plugin>.md` with `paths: ["plugins/<plugin>/**"]` frontmatter (e.g., `.claude/rules/tester.md`). Do not put a `CLAUDE.md` inside a plugin directory: it ships with the plugin, is never loaded as context for installed plugins, and `claude plugin validate` warns about it.
