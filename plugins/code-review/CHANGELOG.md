# Changelog

All notable changes to the **code-review** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release: `code-review` merges the `comment-review` (0.5.0) and
  `quality-review` (0.4.0) plugins under one fan-out orchestrator.
- **`/start-cr` command** — resolves review scope once (current branch diff by
  default, or explicit paths / `--base`), then dispatches **five parallel
  scanners**, one per lens: comments (`R1`–`R12`), readability & tests, naming &
  module, objects & patterns, simplicity & types. It merges their findings
  (dedup, most-specific wins), re-grades quality severities centrally, renders one
  per-file report with the comment and quality vocabularies side by side, and ends
  in a single risk-cut apply menu. It never edits during the review.
- **Standalone skills stay invocable**: `comment-review` (comment quality only)
  and `quality-review` (quality & craft only) remain available for a single-lens
  pass, sharing the same rule text as `/start-cr`.
- **Per-lens rules files** (`references/rules/<lens>.md`) are the single source of
  truth for each lens's rule text, read by both the standalone skills and
  `/start-cr`. One shared `scripts/get_changes.py` resolves the diff scope.

## [0.0.0]

- Scaffold.
