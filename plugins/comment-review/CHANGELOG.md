# Changelog

All notable changes to the **comment-review** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Scope detection now delegates to a bundled `get_changes.py` script** (vendored
  from the hookify `review-changes` skill) instead of inline base-detection bash.
  The base is resolved defensively against `@{upstream}` → `origin/main` →
  `origin/master` → `main` → `master` — the previous loop only checked **local**
  branches (`refs/heads/$c`) and returned `NO_BASE` on a branch forked from
  `origin/main` without a local `main`. The skill now also reviews **uncommitted**
  changes: when both committed and uncommitted changes exist it asks which scope to
  review via `AskUserQuestion`, instead of silently diffing only committed work
  (which left a working-tree-only run with an empty diff). Base resolution computes
  the fork point inside a `subprocess` git call, so no `git merge-base` command is
  run from the skill.
- `AskUserQuestion` added to `allowed-tools` (needed for the scope prompt above).

## [0.3.0] - 2026-06-10

### Added

- **R12 — rationale belongs where the behavior lives.** Catches a genuine *why*
  that clears R1/R2 but is pinned to a *declaration* (enum member, constant,
  type/DTO field, log-code) while it actually explains the behavior of a method
  elsewhere. The tell: the load-bearing clause describes runtime behavior ("the
  conditional UPDATE can't distinguish a missing row from an ineligible status")
  on a line that only names a value. New **MOVE** verdict relocates such a
  comment to the implementing method; **REMOVE** when the rationale is already
  duplicated at the usage site. Reviewer does a best-effort `Grep` for the symbol
  to name the destination method and detect duplication, without blocking the
  finding when the search is inconclusive. Contrast/KEEP: a note about the
  *value's own meaning* (`// 0 means unbounded, not disabled`) stays at the
  declaration.
- MOVE verdict threaded through the report format, tally
  (`… · W move · …`), and the apply step (delete at source; insert at the
  destination only when a single unambiguous usage site was located).
- Eval `misplaced-and-duplicated-rationale` covering R12 MOVE/REMOVE and the
  value-meaning KEEP contrast.

## [0.2.0] - 2026-06-08

### Changed

- R4 tightened: now flags references to **internal project docs** (`DD_ARCH.md §3.2`,
  `DD_PLAN.md T4.1`, Confluence/Notion links), not just other source files. Closes the
  "provenance loophole" — a doc/file ref glued onto an otherwise self-contained sentence
  still goes ("if the sentence reads fine with the ref deleted, the ref was dead weight").
  The KEEP exception is narrowed to **external, pinned** references only (RFC, published
  spec, CVE, commit-pinned URL); internal repo files/docs never qualify.
- R5 tightened: a section-divider banner is removed **whether empty or carrying a
  descriptive title** (e.g. `# ----- DD GCP integration — per-env SA + STS registration -----`).
  Added an explicit rejection of the "long flat file / house convention justifies keeping
  it" rationalization — the fix is splitting the file, not keeping the banner.
- R5 false-positive trap rewritten: only ASCII that *encodes information* (state machine,
  ordering, layout, table) survives; removed the old "only content-free dividers are R5"
  escape hatch that let titled dividers through.
- Report step: suggested fixes must themselves obey the rules — a REWRITE must not
  introduce a file/doc cross-reference (R4) or a divider/banner (R5).
- Added a **deletion test** as the default stance: delete the comment; if the only
  thing lost is a fact the code/types/structure already state, REMOVE it. Domain
  vocabulary does not redeem a restatement. Directly counters the skill's tendency
  to keep plausible-but-empty "WHY-sounding" comments in realistic diffs.
- R1 broadened from "the next code *line*" to "the adjacent code **or data
  structure** at any abstraction level" — catches a prose summary of a map/`Record`
  literal (e.g. "Required NewAudit type sets per report") that merely restates the
  declaration beneath it.
- R6 extended to migration / old-vs-new **mapping** comments (e.g. "Legacy run
  stored Analysis.id refs that match no NewAudit row → facade returns []") — they
  document the change, not the code's present job; that belongs in the migration PR.
- Added **R10 (style consistency)**: a comment out of step with how the file
  comments comparable code (a lone trivial `/** */` on one of several bare sibling
  helpers, mixed register) is low-value prose and goes; consistency, never a reason
  to delete a genuine why.
- Added **R11 (higher bar in test files)**: test comments that restate the test's
  mechanics or the implementation under test are noise; only structural/scenario
  labels (Arrange/Act/Assert, "given …", e2e steps) survive. In test files the
  default flips to REMOVE-when-in-doubt. The `Tests / fixtures` false-positive trap
  was narrowed accordingly (no longer "never R1 them").
- A `NOTE:` / `AGENTS-NOTE:` / `NB:` / `IMPORTANT:` prefix confers **no immunity** —
  strip the prefix and judge the remainder; the marker is not itself a why.

## [0.1.0] - 2026-06-01

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
