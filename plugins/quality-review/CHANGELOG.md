# Changelog

All notable changes to the **quality-review** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-06-08

### Added

- Initial release: `/quality-review` skill that reviews code quality and craft —
  not correctness — against a focused rule set with seven fixed, human-readable
  rule names (no opaque code numbers in the report):
  - **`openness`** — separate logical blocks with blank lines (Clean Code, "each
    blank line is a visual cue that identifies a new and separate concept").
  - **`test-structure`** — group and order arrange/act/assert (given/when/then), no
    interleaving, no mock-extraction variables declared right before a late assert.
  - **`ordering`** — stepdown: public entry point on top, private helpers below it in
    call order, descending one level of abstraction at a time (newspaper metaphor).
  - **`style-mix`** — don't mix OOP and functional ad hoc — a non-exported free
    helper in a class file should be a private method (or extracted + tested), a
    class that appears in functional code needs a why, a function should not share a
    file with an unrelated class or live in a grab-bag module.
  - **`barrel`** — pointless barrel exports unless the project conventions (CLAUDE.md /
    AGENTS.md) mandate them or a comment documents the why.
  - **`needless-cast`** — type casts the value's type already guarantees — common in
    tests where a mock/factory returns the right type, or casts left over from stale
    generated types now regenerated.
  - **`over-complex`** (the priority finding) — two near-identical functions that
    collapse into one with a parameter, copy-pasted branches, code that could be
    smaller — weighed against the flag-argument smell so unification never hurts
    readability.
- Report rendered from **one fixed skeleton** (title → conventions → headline →
  per-file `###` findings → not-flagged → boy-scout → tally), so two reviews look
  the same. One line per finding — `` `name` severity · L<lines> — what the reader
  loses → the fix `` — grouped by file, repeats collapsed, high/medium/nit severity.
  The fix is named as a clause; the full before/after refactor is deferred to apply
  time, not pasted into the report.
- Reads `CLAUDE.md` / `AGENTS.md` first to calibrate the structural rules
  (`ordering`, `style-mix`, `barrel`) against the project's own documented conventions.
- Scope: reviews the current branch diff by default (auto-detects the base branch, or
  pass `--base`), or explicit file/dir paths. Reads the whole file for context but
  **scores the changed lines** — findings split into *primary* (code the change
  touched) and an optional *extra clean-up (boy-scout)* bucket for issues spotted in
  untouched code, kept separate so pre-existing noise never drowns the change.
- Per-rule false-positive calibration so look-alikes (cohesive dense blocks, multi-cycle
  tests, real package entry points, casts at genuine type boundaries) are not flagged.
- Report-only by default; closes with an `AskUserQuestion` follow-up offering concrete
  next steps (apply safe fixes / walk the structural ones / include boy-scout extras /
  report only) rather than an open-ended prompt.
