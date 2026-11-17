# Changelog

All notable changes to the **code-story** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-11-17

### Changed

- A fix whose cause sits in unchanged lines quotes those lines, and a change that makes code elsewhere redundant shows one real caller before and after, saying whether the branch removes it or leaves it for later.

## [0.1.2] - 2026-11-17

### Fixed

- README: the update lookup lists all three places a story is found, including a story link in the request; the base lookup starts with a base named in the request.
- README: `gloss_first_use` says an English term's first use is followed by its translation, as in the settings.
- Updating a whole-stack story from a lower branch measured it to that branch's `HEAD` instead of the top of the stack. The page now records the head ref in `code-story:head-ref`, and `unpack.mjs` writes it back into `story.json`. A story published without it still falls back to `HEAD`. The skill now finds a whole-stack story from a lower branch through its `code-story:stack`, and sets the scope again when it differs from the stored one (for example a merged top PR). A run that tells one branch of a whole-stack story starts a new story, so the stack story other PRs link to is not rewritten.
- `check.mjs` names the ref it compared against when a quoted file is missing, instead of always saying `HEAD`.
- README: the quoted-line check is described as it runs: tagged blocks and trees are skipped, and uncommitted stories are checked against the working tree.

## [0.1.1] - 2026-11-16

### Changed

- shorter description in `plugin.json` and the marketplace listing, at most two sentences

## [0.1.0] - 2026-11-13

### Added

- `code-story` skill, adapted from `will-ness-ai/skills`: builds a chaptered page that teaches how and why a branch, a pull request or a stack of pull requests works. Publishes it as an Artifact and ends with a `CODE_STORY` result line for other skills.
- Updates in place: the page records its repository, branch, base and head SHA, and a later run on the same branch publishes a new version under the same link.
- Bilingual pages: English plus an optional second language with a switch. Code names and programming terms are never translated.
- Built-in dark diagrams (fireworks-lite), or a diagram skill named in the settings.
- `assemble.mjs`, `check.mjs` and `unpack.mjs`. They fill in what git knows (counts, line ranges, SHAs, labels) and check every quoted line against the real file before publishing.
- Settings through a mod `config` tool: `second_language`, `gloss_first_use`, `diagram_skill`, `uncommitted`, `stack`.
- Chapter prose goes through `anti-slop` before the page is assembled. The plugin depends on `anti-slop`, which installs with it.
