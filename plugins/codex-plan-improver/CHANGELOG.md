# Changelog

All notable changes to the **codex-plan-improver** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-03-12

### Added

- Environment variable `CC_TOOLKIT_CODEX_PLAN_REVIEW` to disable automatic plan review
- Author email in plugin manifest

### Changed

- Updated README with environment variable documentation

## [1.0.0] - 2026-03-10

### Added

- Automatic plan review via OpenAI Codex CLI on `ExitPlanMode`
- `/codex-review` command for manual plan review invocation
- Session-scoped flag to prevent infinite review loops
- Read-only sandbox mode for safe code analysis
