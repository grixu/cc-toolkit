# Changelog

All notable changes to the **jev-skill-suggestion** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- The README's Privacy section now says that, with no key set, the prompt and the skills' names and descriptions still go to Claude Code's own small model.

## [0.1.0] - 2026-11-24

### Added

- Ported from davila7/claude-code-templates `jev-skill-suggestion` 0.1.0 (MIT).
- Gemini Decision (`gemini-decision-1`) as a backend: `provider: gemini` and the `geminiApiKey` option; `auto` takes TypeSafe, then Gemini, then the Gateway.
- Keys fall back to `TYPESAFE_API_KEY` and `GEMINI_DECISIONS_API_KEY` or `GEMINI_API_KEY` in the environment, so none has to be passed with `--settings`.
