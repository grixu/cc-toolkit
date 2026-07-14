# Changelog

All notable changes to the **quality-review** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Deprecated

- **Superseded by the `code-review` plugin**, which merges `quality-review` and
  `comment-review` under one fan-out orchestrator (`/start-cr`). This plugin is
  frozen during the deprecation window — rule fixes now land in `code-review` only —
  and will be removed in a later release. Install `code-review` and uninstall this
  plugin. The `quality-review` skill lives on inside `code-review`.

## [0.4.0] - 2026-07-14

### Added

- **Thirteen new rules, grouped into a family taxonomy** distilled from Kent Beck's
  *Smalltalk Best Practice Patterns*. The rule vocabulary grows from 7 flat names to
  **7 families × 20 rules**, with the family as the stable top-level label:
  - **`readability`** — new `guard-clause` (early-return over deep nesting),
    `explaining-variable` (name an opaque expression), `magic-literal` (name domain
    literals), `composed-method` (one function, one level of abstraction; a
    temp-heavy method becomes a method object) — alongside existing `openness`,
    `ordering`.
  - **`naming`** (new family, now **in scope**) — `intent-name` (name after *what*,
    not *how*), `role-name` (name by role, not type), `command-query` (queries return
    without mutating; commands mutate; `is`/`has`/`can` booleans).
  - **`objects`** (new family) — `full-construction` (fully-formed objects; hidden
    representation), `lazy-init` (defer the expensive-and-maybe-unneeded),
    `leaky-collection` (never return a raw internal mutable collection).
  - **`patterns`** (new family, **conservative**) — `composition` (delegate over
    inherit), `polymorphism` (replace a repeated type-discriminant switch),
    `execute-around` (bracket paired actions). Flagged **only when the friction
    already exists in the code**, never proactively — patterns are refactoring
    targets, not upfront mandates.
  - Existing `test-structure`, `style-mix`, `barrel`, `over-complex`, `needless-cast`
    are regrouped under `tests`, `module`, and `simplicity` families unchanged.

### Changed

- **Report contract: findings are now tagged `` `family` · rule severity `` instead
  of `` `name` severity ``.** The family is the stable, backticked top-level
  vocabulary (7 labels); the rule is its fixed sub-tag. Existing rule names are
  unchanged — they now sit under a family.
- **Naming is in scope.** The skill's stated exclusions drop "naming" (correctness,
  security, performance, and test coverage remain out of scope). `lazy-init` is
  framed as a *state-initialization* pattern flagged conservatively, so the
  performance exclusion still holds.
- **Fan-out lenses rebalanced from 3 to 4**, aligned to the family clusters
  (readability+tests · naming+module · objects+patterns · simplicity), each keeping
  whole files so cross-file rules still see context.

## [0.3.0] - 2026-06-10

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

## [0.2.0] - 2026-06-09

### Changed

- **Severity is now a property of the rule, not the file's overall impression.**
  Added an explicit anti-anchoring rule to Step 2: once something is a finding, its
  severity comes from the table (`over-complex`/`style-mix`/`needless-cast` → high;
  `ordering`/`test-structure`/`barrel` → medium; `openness` → nit) and may not be
  downgraded because the change is otherwise clean. Fixes the case where a real
  `test-structure` interleaving on an otherwise-tidy file was reported as a `nit`
  and buried under a "clean change" headline.
- **The headline may no longer contradict the tally** — a change with any high or
  medium finding cannot be called "clean" / "only cosmetic nits"; the collapsed
  one-line verdict is reserved for a tally that is empty or nits-only.

### Added

- **Multi-lens fan-out mode (Step 1.5)** for large diffs (~20+ in-scope files):
  optionally dispatch parallel subagents by rule family — structure & tests
  (`openness`/`test-structure`/`ordering`), simplification & waste
  (`over-complex`/`needless-cast`), module shape (`style-mix`/`barrel`) — each
  keeping whole files so cross-file rules still see context. The main agent merges,
  dedups (most-specific wins), and **re-grades every finding** against the severity
  table before rendering the single report. Inline single-agent review stays the
  default below the threshold. `Task` added to `allowed-tools`.

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
