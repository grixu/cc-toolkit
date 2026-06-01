# Changelog

All notable changes to the **comment-review** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release: `/comment-review` skill that reviews comment quality against a focused
  rule set — R1–R7 (no narration, decisions only, not too long, no cross-file/doc references,
  no banner sections, no change-state/ticket history, no process-narration disguised as
  decisions) plus R8 (no commented-out code) and R9 (no comment that contradicts the code,
  surfaced first).
- Doc-comment calibration: idiomatic public-API doc comments (godoc, docstrings, JSDoc,
  Rust `///`) are judged on correctness and length, not flagged for merely existing.
- Scope script uses triple-dot `git diff <base>...HEAD` directly instead of a separate
  `git merge-base` call — shorter, equivalent, and avoids repos whose hooks block the
  word "merge".
- R6 exception broadened: a comment citing a ticket id to document a *present* constraint
  (not just a `TODO`/`FIXME`) is kept; only closed-ticket breadcrumbs and "what changed"
  history are removed.
- Auto scope: reviews the current branch diff (auto-detects `main`/`master`/`develop`/`trunk`,
  or `--base <branch>`), or explicit file/dir paths when passed as arguments.
- False-positive calibration section so look-alikes (self-documenting markup, real ASCII
  diagrams, present-tense TODO landmines, genuine ordering invariants, test scaffolding)
  are not wrongly flagged.
- Per-comment verdicts (KEEP / REMOVE / REWRITE) with reasons and concrete suggested fixes;
  optionally applies fixes after user confirmation.
