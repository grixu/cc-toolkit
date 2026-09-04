# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Monorepo of Claude Code plugins, published as a marketplace at `grixu/cc-toolkit`. Each plugin lives in `plugins/<name>/` with its own `plugin.json`, `CHANGELOG.md`, and `README.md`.

## Rules of Working

- Always read the current Claude Code plugin documentation before creating a new plugin or updating `.claude-plugin/marketplace.json`
- Always propose a plan and get approval before implementing
- Show missing questions, unresolved cases, and edge cases not covered in skills, commands, or scripts

## Script Language Preference

When creating new scripts, prefer (in order): Bash > Node.js > Python.

## Releasing

Always use `./scripts/release.sh <plugin-name> <patch|minor|major>` — do not perform release steps manually. Requires `jq` and `git`; `gh` is optional for creating GitHub Releases.

## Commits

Use conventional commits with scope: `feat(hookify):`, `fix(codex-plan-improver):`, `chore:`, `docs:`, `ci:`, etc.

## Plugin Structure

Every plugin must have:
- `.claude-plugin/plugin.json` — name, version, description, author, repository, keywords
- `CHANGELOG.md` — Keep a Changelog format with `[Unreleased]` section
- `README.md`

Plugins may also include: `commands/`, `hooks/`, `skills/`, `agents/`, `references/`, `scripts/`, `examples/`.

The root `.claude-plugin/marketplace.json` must list every plugin with matching name, version, source path, description, author, category, and tags.

## Hookify Upstream Sync

The hookify plugin is forked from `anthropics/claude-plugins-official`. Upstream syncs go to the `hookify-upstream` branch via `scripts/sync-hookify.sh` and CI (`.github/workflows/sync-hookify.yml`). Merge conflicts may arise when local changes overlap with upstream.

## Per-Plugin Conventions

Plugins with complex conventions get a path-scoped rule in `.claude/rules/<plugin>.md` with `paths: ["plugins/<plugin>/**"]` frontmatter (e.g., `.claude/rules/scribe.md`). Do not put a `CLAUDE.md` inside a plugin directory: it ships with the plugin, is never loaded as context for installed plugins, and `claude plugin validate` warns about it.
