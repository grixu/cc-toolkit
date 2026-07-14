# quality-review

A single-skill Claude Code plugin that reviews **how your code reads**, not
whether it works. It is the craft pass: readability, vertical structure, function
ordering, stylistic consistency, and needless complexity — the friction that
survives a green test suite.

It exists because code from a strong model is usually *correct* but *glued
together*: small functions stacked with no blank line, edge cases buried in deep
nesting instead of guard clauses, magic literals with no name, helpers named after
mechanism not intent, queries that quietly mutate, half-initialized objects, getters
that leak their internal collection, OOP and functional styles mixed, pointless
barrel exports, casts that aren't needed, and two near-identical functions that
should be one. None of that is a bug; all of it slows the next reader. This skill
finds it and proposes the smaller, calmer version.

## Installation

From the `grixu/cc-toolkit` marketplace:

```
/plugin marketplace add grixu/cc-toolkit
/plugin install quality-review
```

## Usage

```
/quality-review                 # review the current branch diff (committed + uncommitted)
/quality-review src/auth.ts     # review specific files in full
/quality-review src/ lib/       # review directories
/quality-review --base develop  # diff against a different base branch
```

You can also just ask in natural language: *"przejrzyj tę zmianę pod kątem
jakości"*, *"czy ten kod się dobrze czyta?"*, *"quality review on this PR"*.

The skill reads the project's own `CLAUDE.md` / `AGENTS.md` first (so it doesn't
fight your documented conventions), then prints a report in **one fixed skeleton**
(same shape every run) — one line per finding,
`` `family` · rule severity · L<lines> — what you lose → the fix `` — where the fix
is named as a clause, not pasted as a code block (the full refactor only shows up if
you choose to apply it). It closes by asking, via a menu, how you want to proceed,
and never edits during the review.

It focuses on **what your change touched**: findings in the added/modified code
are the review; anything it spots in untouched code is split off into an optional
*boy-scout* clean-up block ("leave it cleaner than you found it") so pre-existing
issues never bury the ones your change introduced.

## The rules

Every finding is tagged with a **family** (the stable top-level label) and a
specific **rule** under it, so the label never drifts between reviews. Seven
families, twenty rules — distilled from Kent Beck's *Smalltalk Best Practice
Patterns* and Clean Code:

**`readability`** — how the code reads top-to-bottom.

- **`openness`** — separate logical blocks with a blank line ("each blank line is a
  visual cue that identifies a new and separate concept"). *Calibration:* tight
  cohesive lines should stay dense — don't double-space everything.
- **`guard-clause`** — handle edge cases up top and return early; the main path
  reads unindented. *Calibration:* genuine two-armed branches aren't guard + body.
- **`explaining-variable`** — name an opaque expression with a local; the name is
  the explanation. *Calibration:* don't name the already-plain.
- **`magic-literal`** — name literals that carry domain meaning (`86400`, a status
  code). *Calibration:* `0`/`1`/`-1` and obvious base cases stay bare.
- **`composed-method`** — one function, one level of abstraction; decompose a method
  that does several tasks (a huge temp-sharing one becomes a method object).
  *Calibration:* don't shatter a cohesive function to hit a length target.
- **`ordering`** — public entry point on top, helpers below in call order — the
  stepdown / newspaper metaphor. *Calibration:* respect hoisting/lint/convention.

**`tests`**

- **`test-structure`** — group and order arrange / act / assert (given / when /
  then); no interleaving, no mock-extraction variable declared right before the
  third assertion that uses it. *Calibration:* genuine multi-step progressions may
  alternate.

**`naming`**

- **`intent-name`** — name after *what*, not *how* (`includes`, not
  `linearSearchFor`). *Calibration:* keep names where the mechanism *is* the intent.
- **`role-name`** — name by role, not type (`employees`, not `employeeList`).
  *Calibration:* a suffix that disambiguates two roles is fine.
- **`command-query`** — a query returns without mutating (`is`/`has`/`can` for
  booleans); a command mutates. *Calibration:* idiomatic `pop()`/`set()` and
  builder chaining are fine.

**`module`** — how code is split across files.

- **`style-mix`** — don't mix OOP and functional ad hoc — a non-exported free helper
  in a class file should be a private method (or extracted and unit-tested), a class
  in functional code needs a why, a function shouldn't share a file with an unrelated
  class or live in a grab-bag module. *Calibration:* a small file-local pure helper,
  factories, and function components are fine.
- **`barrel`** — drop `index.ts` re-export layers that narrow nothing, unless the
  project mandates them or a comment documents the why. *Calibration:* real package
  entry points are load-bearing.

**`objects`** — object and state design.

- **`full-construction`** — construct fully-formed objects (all required params
  upfront, defaults in the constructor); hide the representation. *Calibration:*
  builders and framework lifecycle are fine.
- **`lazy-init`** — defer the expensive-and-maybe-unneeded to first access and cache.
  *Calibration:* a state pattern, not a perf pass — flag only the clear case.
- **`leaky-collection`** — never return a raw internal mutable collection; return a
  copy, a view, or add/remove methods. *Calibration:* a freshly-built or readonly
  collection is fine.

**`patterns`** — *reach for these under friction, not upfront.* Flagged **only when
the friction already exists**, never because a pattern could apply.

- **`composition`** — delegate instead of subclassing, when the inheritance already
  causes duplication or coupling.
- **`polymorphism`** — replace the **same** type-discriminant `if`/`switch` repeated
  in ≥2 places with a strategy/polymorphic object.
- **`execute-around`** — bracket paired actions (open/close, lock/unlock) behind one
  callback-taking function, when the pair is already duplicated or a close is missing.

**`simplicity`**

- **`over-complex`** (the priority) — two near-identical functions that collapse into
  one with a parameter, copy-pasted branches, code that could be smaller.
  *Calibration:* weighed against the flag-argument smell — don't force a boolean that
  makes one function do two jobs, and don't prematurely DRY things that will diverge.
- **`needless-cast`** — flag casts the value's type already guarantees — common in
  tests, or left over from stale generated types. Verified against current types
  before flagging. *Calibration:* keep casts at real boundaries (`JSON.parse`,
  external APIs, `as const`).

## Scope

Reviews source files (`.ts .tsx .js .jsx .py .go .rs .java .kt .swift .c .cpp .rb
.php .vue .scala .cs` …), reading enough of each file to judge structure — not
just the changed lines, since ordering, style, and duplication are whole-file and
cross-file properties. Skips JSON, lockfiles, generated/minified files, Markdown,
and config.

With no path arguments it reviews the current branch diff. The base is detected
defensively (`@{upstream}` → `origin/main` → `origin/master` → `main` → `master`,
or `--base <branch>`), and both **committed** and **uncommitted** changes are
considered — when both exist, the skill asks which scope to review.

## What it does *not* do

Correctness, security, performance, and test coverage are out of scope — this is
purely the quality/craft pass. (Naming *is* in scope, via the `naming` family:
intent- and role-revealing names and command/query separation.) Pair it with
`comment-review` (comment quality) and your normal correctness review.
