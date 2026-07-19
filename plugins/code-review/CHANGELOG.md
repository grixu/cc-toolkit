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
  in a single risk-cut apply menu. It never edits during the review; once fixes are
  approved, mechanical batches fan out across per-file editor subagents (ownership
  disjoint by file) while structural changes are walked one at a time, and every
  site is re-located by content — Scanner line numbers are treated as estimates.
- **Standalone skills stay invocable**: `comment-review` (comment quality only)
  and `quality-review` (quality & craft only) remain available for a single-lens
  pass, sharing the same rule text as `/start-cr`.
- **Per-lens rules files** (`references/rules/<lens>.md`) are the single source of
  truth for each lens's rule text, read by both the standalone skills and
  `/start-cr`. One shared `scripts/get_changes.py` resolves the diff scope.
- **`tests` · `test-fidelity` rule** — flags a test whose name or fixture claims a
  boundary its assertions don't actually check (passes while guarding the wrong
  thing).
- **Foreground fan-out** — `/start-cr` dispatches scanners and editor subagents in
  the foreground (results returned directly), never as background agents, avoiding
  the heavier agent-teams/mailbox path and the polling it forces.
- **Cross-lens `HANDOFF`** — a Scanner routes an out-of-family finding to the
  orchestrator, which grades it against the master table instead of losing it in
  prose.
- **`(verify)` resolution before apply** — a finding a Scanner couldn't confirm (a
  `needless-cast` above all) is verified centrally before the report and never enters
  an apply batch unconfirmed.
- **Severity self-check** — the orchestrator checks every finding's severity against
  the master table before rendering, so one rule can't appear with two severities.
- **Apply menu capped at four options** — the four canonical risk buckets are the
  whole menu, honoring `AskUserQuestion`'s limit.

## [0.0.0]

- Scaffold.
