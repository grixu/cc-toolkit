# Changelog

All notable changes to the **hookify** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
