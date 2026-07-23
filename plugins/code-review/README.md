# code-review

The successor to the `comment-review` and `quality-review` plugins. One
orchestrator fans out **five parallel scanners** — one per lens — over a change,
each judging a fixed rule subset, then merges every finding into a **single
per-file report**. Comment quality and quality/craft now live in one pass instead
of two separate runs.

## Installation

From the `grixu/cc-toolkit` marketplace:

```
/plugin marketplace add grixu/cc-toolkit
/plugin install code-review
```

## Usage

```
/start-cr                    # full review (all 5 lenses) of the current branch diff
/start-cr src/auth.ts        # full review of specific files
/start-cr --base develop     # diff against a different base branch
/comment-review              # comment-quality lens only
/quality-review              # quality/craft lenses only
```

`/start-cr` always runs **all five lenses** — there is no lens selection. For a
partial review, invoke `/comment-review` or `/quality-review` directly; both stay
independently available and share the same rule text as the command.

The report groups by **file**, with the two vocabularies side by side — comment
verdicts (`R1`–`R12` · KEEP/REMOVE/REWRITE/MOVE) and quality findings
(`` `family` · rule · severity ``) — no mapping between them. `/start-cr` never
edits during the review; it ends with a single risk-cut apply menu.

## The lenses

Five equal lenses, each a scanner with its own rules file:

- **comments** (`R1`–`R12`) — no code-narration, decisions-only, no
  banners/dividers, no change-history, no cross-file/spec-id references, no
  commented-out code, no comment that contradicts the code, rationale pinned where
  the behavior lives.
- **readability & tests** — openness (blank-line separation), guard-clause,
  explaining-variable, magic-literal, composed-method, stepdown ordering,
  arrange/act/assert test structure, and test-fidelity (a test must check the
  boundary its name claims).
- **naming & module** — intent-revealing names, role- (not type-) names,
  command/query separation, no ad-hoc OOP/functional style-mix, no pointless
  barrel re-exports.
- **objects & patterns** — full construction, lazy-init, no leaky internal
  collections, composition over inheritance, polymorphism over repeated
  type-switches, execute-around for paired actions. Patterns are flagged **only
  under real friction**, never because one could apply.
- **simplicity & types** — over-complex code that collapses (the priority),
  needless casts the type already guarantees, and dead code that can never run or
  is never used.

## Scope

Reviews source files that carry human-authored comments / code. Skips JSON,
lockfiles, generated/minified files, Markdown/docs, config, and license headers.

**This is a craft review, not a security or correctness audit.** The five lenses
judge how code reads and is structured — they do not hunt for bugs, injection,
authz gaps, unsafe deserialization, or dependency risk. A vulnerability will surface
here only by accident, as a side effect of some readability or test rule. Run a
dedicated security review alongside it; do not read a clean `/start-cr` report as
"this change is safe".

With no path arguments it reviews the current branch diff. The base is detected
defensively (`@{upstream}` → `origin/main` → `origin/master` → `main` → `master`,
or `--base <branch>`), and both **committed** and **uncommitted** changes are
considered — when both exist, it asks which scope to review.

## Migration

`code-review` supersedes `comment-review` and `quality-review`. After installing
it, **uninstall the old two** to avoid duplicate skills: a user with both
generations installed sees two `comment-review` and two `quality-review` skills —
the new namespaced `code-review:comment-review` alongside the old
`comment-review:comment-review`.
