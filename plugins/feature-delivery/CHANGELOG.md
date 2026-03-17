# Changelog

All notable changes to the **feature-delivery** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-03-17

### Changed

- Move requirement files from local `requirements/` folder to `~/.claude/grixu-cc-toolkit/feature-delivery/<project-name>/` — keeps project repos clean and persists specs across clones
- Add `storage-root.sh` script to compute deterministic storage path from project directory name
- Add `Bash` to allowed tools in `start`, `current`, and `edit` commands (needed to invoke `storage-root.sh`)

## [1.0.0] - 2026-03-16

### Added

- `/start` command — 6-phase requirements gathering (complexity analysis, discovery Q&A, codebase research, technical Q&A, test planning, spec generation)
- `/current` command — requirements dashboard with status, progress, and available actions
- `/edit` command — specification editing with full re-analysis cycle and version tracking
- `/implement` command — implementation orchestrator with parallel subagents, validation, and quality gates
- 24 reference/prompt files for phase-specific subagent guidance
