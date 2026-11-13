# Changelog

All notable changes to the **code-story** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-13

### Added

- `code-story` skill, adapted from `will-ness-ai/skills`: builds a chaptered page that teaches how and why a branch, a pull request or a stack of pull requests works. Publishes it as an Artifact and ends with a `CODE_STORY` result line for other skills.
- Updates in place: the page records its repository, branch, base and head SHA, and a later run on the same branch publishes a new version under the same link.
- Bilingual pages: English plus an optional second language with a switch. Code names and programming terms are never translated.
- Built-in dark diagrams (fireworks-lite), or a diagram skill named in the settings.
- `assemble.mjs`, `check.mjs` and `unpack.mjs`. They fill in what git knows (counts, line ranges, SHAs, labels) and check every quoted line against the real file before publishing.
- Settings through a mod `config` tool: `second_language`, `gloss_first_use`, `diagram_skill`, `uncommitted`, `stack`.
- Chapter prose goes through `anti-slop` before the page is assembled. The plugin depends on `anti-slop`, which installs with it.
