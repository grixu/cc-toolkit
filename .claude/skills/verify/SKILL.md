---
name: verify
description: Validate plugin structure, marketplace.json consistency, and changelog format across all plugins
---

Run the following checks for every plugin in `plugins/*/`:

## 1. Plugin structure
For each plugin directory, verify these files exist:
- `.claude-plugin/plugin.json`
- `CHANGELOG.md`
- `README.md`

Report any missing files. Also report a plugin-root `CLAUDE.md` as a failure: it ships with the plugin, is never loaded as context for installed plugins, and `claude plugin validate` warns about it. Per-plugin conventions belong in `.claude/rules/<plugin>.md`.

## 2. plugin.json validity
For each plugin's `.claude-plugin/plugin.json`, verify:
- Has required fields: `name`, `version`, `description`, `author`, `repository`, `keywords`
- `version` matches semver format (e.g., `1.0.0`, `0.1.1`)
- `name` matches the plugin directory name

## 3. Marketplace consistency
Read `.claude-plugin/marketplace.json` and for each plugin entry:
- `name` matches the plugin's `plugin.json` name
- `version` matches the plugin's `plugin.json` version
- `source` path points to the correct directory (`./plugins/<name>`)
- `description` is present and non-empty
- `author` matches the plugin's `plugin.json` author exactly (both `name` and `email`)

Report any plugins in `plugins/` that are missing from marketplace.json, and any marketplace entries pointing to non-existent plugins.

## 4. Changelog format
For each plugin's `CHANGELOG.md`:
- Must have an `## [Unreleased]` section (required by the release script)
- Must follow Keep a Changelog format
- Version entries should match semver

## 5. Summary
Print a summary with pass/fail for each check. If all checks pass, confirm everything is consistent. If any fail, list exactly what needs to be fixed.
