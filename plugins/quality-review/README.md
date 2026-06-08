# quality-review

A single-skill Claude Code plugin that reviews **how your code reads**, not
whether it works. It is the craft pass: readability, vertical structure, function
ordering, stylistic consistency, and needless complexity — the friction that
survives a green test suite.

It exists because code from a strong model is usually *correct* but *glued
together*: small functions stacked with no blank line, helpers in random order,
OOP and functional styles mixed, pointless barrel exports, casts that aren't
needed, and two near-identical functions that should be one. None of that is a
bug; all of it slows the next reader. This skill finds it and proposes the
smaller, calmer version.

## Installation

From the `grixu/cc-toolkit` marketplace:

```
/plugin marketplace add grixu/cc-toolkit
/plugin install quality-review
```

## Usage

```
/quality-review                 # review the current branch diff vs main/master
/quality-review src/auth.ts     # review specific files in full
/quality-review src/ lib/       # review directories
/quality-review --base develop  # diff against a different base branch
```

You can also just ask in natural language: *"przejrzyj tę zmianę pod kątem
jakości"*, *"czy ten kod się dobrze czyta?"*, *"quality review on this PR"*.

The skill reads the project's own `CLAUDE.md` / `AGENTS.md` first (so it doesn't
fight your documented conventions), then prints a report in **one fixed skeleton**
(same shape every run) — one line per finding,
`` `name` severity · L<lines> — what you lose → the fix `` — where the fix is named
as a clause, not pasted as a code block (the full refactor only shows up if you
choose to apply it). It closes by asking, via a menu, how you want to proceed, and
never edits during the review.

It focuses on **what your change touched**: findings in the added/modified code
are the review; anything it spots in untouched code is split off into an optional
*boy-scout* clean-up block ("leave it cleaner than you found it") so pre-existing
issues never bury the ones your change introduced.

## The rules

Each finding is tagged with one of seven **fixed rule names** (so the label never
drifts between reviews):

1. **`openness`** — separate logical blocks with a blank line, because "each blank
   line is a visual cue that identifies a new and separate concept" (Clean Code).
   *Calibration:* tight cohesive lines should stay dense — don't double-space
   everything.
2. **`test-structure`** — group and order arrange / act / assert (given / when /
   then); no interleaving, no mock-extraction variable declared right before the
   third assertion that uses it. *Calibration:* genuine multi-step progressions
   are allowed to alternate.
3. **`ordering`** — public entry point on top, private helpers below in call
   order, descending one level of abstraction at a time — the stepdown / newspaper
   metaphor. *Calibration:* respect hoisting/lint/convention-bound orders.
4. **`style-mix`** — don't mix OOP and functional ad hoc — a non-exported free
   helper in a class file should be a private method (or extracted and
   unit-tested), a class in functional code needs a why, a function shouldn't share
   a file with an unrelated class or live in a grab-bag module. *Calibration:* a
   small file-local pure helper, factories, and function components are fine.
5. **`barrel`** — drop `index.ts` re-export layers that narrow nothing, unless the
   project mandates them or a comment documents the why. *Calibration:* real
   package entry points are load-bearing.
6. **`needless-cast`** — flag casts the value's type already guarantees — common in
   tests, or left over from stale generated types. Verified against current types
   before flagging. *Calibration:* keep casts at real boundaries (`JSON.parse`,
   external APIs, `as const`).
7. **`over-complex`** (the priority) — two near-identical functions that collapse
   into one with a parameter, copy-pasted branches, code that could be smaller.
   *Calibration:* weighed against the flag-argument smell — don't force a boolean
   that makes one function do two jobs, and don't prematurely DRY things that will
   diverge.

## Scope

Reviews source files (`.ts .tsx .js .jsx .py .go .rs .java .kt .swift .c .cpp .rb
.php .vue .scala .cs` …), reading enough of each file to judge structure — not
just the changed lines, since ordering, style, and duplication are whole-file and
cross-file properties. Skips JSON, lockfiles, generated/minified files, Markdown,
and config.

## What it does *not* do

Correctness, security, performance, naming, and test coverage are out of scope —
this is purely the quality/craft pass. Pair it with `comment-review` (comment
quality) and your normal correctness review.
