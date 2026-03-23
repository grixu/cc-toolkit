# Changelog

All notable changes to the **hookify** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
