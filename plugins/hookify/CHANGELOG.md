# Changelog

All notable changes to the **hookify** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `references/rule-syntax.md`: every frontmatter key, field, operator, event outcome and parser limit.

### Changed

- Author metadata now reads `Mateusz Gostański <mg@grixu.dev>` in `plugin.json` and the marketplace entry.
- README rewritten for first-time users: install from the `cc-toolkit` marketplace, a quick start, one rule format with event and field tables, rule locations, namespaced `/hookify:*` commands, what this fork adds, and known limits. Corrects the Python requirement to 3.9 or later.

### Fixed

- `prompt` rules now match the submitted prompt. The engine read `user_prompt`, but Claude Code sends the text as `prompt`; a simple `pattern:` and a `field: prompt` or `field: user_prompt` condition all read it now.
- `file` rules with a simple `pattern:` (or a `new_text` condition) now see the content of `Write` calls. Before, `new_text` read only Edit's `new_string`, so new files were never checked.
- The "require tests before stopping" example (README and `examples/require-tests-stop.local.md`) blocked every stop: `not_contains` compares literal text, so `npm test|pytest|cargo test` never matched. It now uses a negative-lookahead `regex_match` that looks for a Bash call running one of those commands.
- The frontmatter parser now unescapes `\\` and `\"` in double-quoted values, as YAML does. `examples/coding-standards.rule.md` (`":\\s*any\\b|<any>"`) never matched `: any` because the regex kept both backslashes. Other sequences such as `\s` stay as written, so existing `"rm\s+-rf"` patterns keep working.
- The "Hookify: Blocked operation by rule" notice now names the rules that blocked the call. It named the last rule evaluated, which could be an unrelated warn rule.
- `stop` and `prompt` rules no longer run on tool calls. For tools other than Bash, Edit, Write and MultiEdit the tool hooks load every rule, so an enabled stop rule on `transcript` denied `Read`, `Grep` and similar calls, and a prompt rule matched the `prompt` input of `Agent` or `WebFetch`.

## [0.4.0] - 2026-04-27

### Added

- `review-changes` skill — hookify-rules-aware code review of committed and uncommitted changes. Loads enabled `file`/`all` rules, partitions changed files into non-overlapping rule-scoped groups, dispatches parallel subagents, and aggregates a per-rule violation report. Offers to save the report or enter Plan Mode with a fix plan grouped by file.

## [0.3.0] - 2026-03-27

### Added

- `.rule.md` extension for team/project rules (committed to repo)
- Global rules from `~/.claude/hookify.*.local.md`
- Name-based priority system: project .local.md > project .rule.md > global .local.md
- `source` and `source_type` fields on Rule dataclass for provenance tracking
- New example rule files demonstrating `.rule.md` format

### Changed

- `load_rules()` now scans three tiers instead of one
- Updated all commands, skills, agents, and documentation for multi-source support

## [0.2.0] - 2026-03-23

### Changed

- Migrated upstream source from `anthropics/claude-code` to correct upstream `anthropics/claude-plugins-official`
- Re-applied `permissionDecisionReason` in hook deny output for better diagnostics
- Re-applied improved `systemMessage` format on blocked operations to show rule name
- Updated sync scripts and CI workflow for new upstream repository

## [0.1.1] - 2026-03-17

### Added

- Forked from upstream anthropics/claude-code hookify plugin (v0.1.0)
- Upstream sync script and CI workflow for automated upstream tracking

### Changed

- Add `permissionDecisionReason` to hook deny output for better diagnostics
- Improve `systemMessage` format on blocked operations to show rule name
