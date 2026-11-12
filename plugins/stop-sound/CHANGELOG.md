# Changelog

All notable changes to the **stop-sound** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-12

### Added

- A chime when the main session ends its turn, skipped while a subagent or teammate still runs in the background.
- A second chime when Claude calls `AskUserQuestion` or `ExitPlanMode`.
- `stop_sound` and `question_sound` options to replace either bundled sound with your own file.
