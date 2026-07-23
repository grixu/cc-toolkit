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
- **Concurrent fan-out runs in the background** — `/start-cr` emits its five scanners in
  one message, which runs them concurrently; a concurrent fan-out is backgrounded by the
  harness (a `run_in_background: false` flag can't make it synchronous), so the
  orchestrator waits for the five completion notifications and never polls, pre-reading
  the diff while it waits. Editor subagents in the apply phase stay foreground.
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
- **Severity vocabulary pinned** — a Scanner grades `high`, `medium`, or `nit` and
  nothing else, including in lenses whose own rules file lists only one of the three.
- **Cross-lens convergence is a confidence signal** — a finding several Scanners
  reached independently leads its file and is a headline candidate; convergence never
  moves severity, which stays verbatim from the master table.
- **Editor fan-out has a countable threshold** — the safe batch fans out on four or
  more files not yet read this session, and is applied inline otherwise, so an editor
  never pays a second read for a file the orchestrator already holds.
- **Scanners resolve their own doubts** — `(verify)` is reserved for what a Scanner
  genuinely cannot check (runtime behaviour, out-of-scope files) instead of being the
  default for any uncertain finding.
- **`Not flagged` may itemize** — a real problem with no rule to land on gets its own
  bullet instead of being compressed into a subordinate clause.
- **Findings sections hold findings only** — a checked-and-cleared item goes in prose,
  never in the finding shape with a dash where the severity belongs.
- **A fully added file has no boy-scout findings** — every finding in a status-`A` file
  is primary, since the whole file is code the change introduced.
- **Duplication findings sweep the whole file** — a Scanner flagging repeated code lists
  every copy in the file, not just the ones inside the diffed hunk, so the extraction
  fix can't leave a straggler behind.
- **Convention sources include `.claude/rules/`** — Step 2 reads every `.claude/rules/*.md`
  (and re-asserts the repo-root `CLAUDE.md`/`AGENTS.md`) before dispatch, so a
  repo-sanctioned convention such as an `AGENTS-NOTE:` anchor-comment prefix can't surface
  as a finding.
- **Scope list reused, not recomputed** — Step 1 reuses the file list detection already
  produced for `uncommitted`/`committed`, re-running the script only for the `Both` scope.

### Documentation

- README states plainly that this is a craft review, not a security or correctness
  audit.

## [0.0.0]

- Scaffold.
