# code-review

The successor to the `comment-review` and `quality-review` plugins. One
orchestrator fans out **parallel scanners** — one per active lens, six to eight
per run — over a change, each judging a fixed rule subset, then merges every
finding into a **single per-file report**. Comment quality, quality/craft, and a
narrow security pass live in one run instead of separate ones.

## Installation

From the `grixu/cc-toolkit` marketplace:

```
/plugin marketplace add grixu/cc-toolkit
/plugin install code-review
```

## Usage

```
/start-cr                          # full review of the current branch diff
/start-cr src/auth.ts              # full review of specific files
/start-cr --base develop           # diff against a different base branch
/start-cr --spec docs/feature.md   # also judge the change against a local spec
/comment-review                    # comment-quality lens only
/quality-review                    # quality/craft lenses only
```

`/start-cr` has no lens switch; the change decides which lenses run. The five
craft lenses and `security` run every time; `performance` runs when the change
touches executable source; `spec` runs only when you pass `--spec <path>`. The
report's `Lenses: L of 8` line names every lens that sat out and why. For a
partial review, invoke `/comment-review` or `/quality-review` directly; both stay
independently available and share the same rule text as the command. The three
added lenses have no standalone skill.

The report groups by **file**, with the two vocabularies side by side — comment
verdicts (`R1`–`R12` · KEEP/REMOVE/REWRITE/MOVE/ADD) and quality findings
(`` `family` · rule · severity `` across eleven families: `readability`, `tests`,
`naming`, `module`, `objects`, `patterns`, `simplicity`, `security`,
`performance`, `spec`, and the repo-defined `standards`) — no mapping between
them. `/start-cr` never edits during the review; it ends with a single risk-cut
apply menu.

## The lenses

Eight lenses, each a scanner with its own rules file. Five craft lenses run on
every change:

- **comments** (`R1`–`R12`) — no code-narration, decisions-only, no
  banners/dividers, no change-history, no cross-file/spec-id references, no
  commented-out code, no comment that contradicts the code, rationale pinned where
  the behavior lives.
- **readability & tests** — openness (blank-line separation), guard-clause,
  explaining-variable, magic-literal, composed-method (including a conditional
  bolted onto a flow whose concern it does not share), stepdown ordering,
  arrange/act/assert test structure, and test-fidelity (a test must check the
  boundary its name claims).
- **naming & module** — intent-revealing names (a `data`/`handle`/`process` that
  reveals nothing counts), role- (not type-) names, command/query separation, no
  ad-hoc OOP/functional style-mix, no pointless barrel re-exports, dependency
  direction (no import that closes a cycle or points from a shared module into a
  feature), no feature logic misplaced in a shared module, no helper duplicating
  one the repo already exports, and no pass-through wrapper that forwards
  unchanged — the one rule that absorbs middle-man and needless indirection. This
  lens reads one hop across files (the importers and imports of each changed
  module) and no further.
- **objects & patterns** — full construction, lazy-init, no leaky internal
  collections, no feature envy (a method living on the wrong object), no data
  clumps (the same values travelling together), no message chains through other
  objects' internals, composition over inheritance, polymorphism over repeated
  type-switches, execute-around for paired actions. Patterns are flagged **only
  under real friction**, never because one could apply.
- **simplicity & types** — over-complex code that collapses (the priority),
  needless casts the type already guarantees, and dead code that can never run,
  is never used, or is speculative generality nothing calls.

Three more sit beyond the craft five — one always on, two gated — and the report
says which ran:

- **security** — always on. Secrets in source, injection sinks, missing access
  checks, unvalidated boundaries, and insecure settings in source files. A
  finding names both the source and the sink; a pattern alone is never a finding.
- **performance** — only when the change touches executable source (not tests,
  not infrastructure-as-code). N+1 calls, unbounded fetches, blocking calls on an
  async path, wasted React renders. Every finding names the multiplier, the call
  inside it, the missing bound, and the batch/limit API that exists; "could be
  slow" is not a finding.
- **spec** — only with `--spec <path>` (a local file). A spec line nothing
  implements, one implemented against its wording, one only partly met, and scope
  creep the spec never asked for. Every finding quotes the spec line.

## Coding standards

Two files at the repository root turn the project's own rules into findings:

- `CODING_STANDARDS.md` — the shared standard, committed.
- `CODING_STANDARDS.local.md` — a personal overlay; **gitignore it**.

Both apply (LAYER): the `.local` file adds to the shared one and wins per
statement where the two disagree, so it can relax or tighten a single rule
without copying the whole file. Only the root pair counts — the files are not
looked for in subdirectories.

An explicit, quotable rule ("Domain services MUST NOT import from `infra/`")
becomes a `standards` finding that quotes the rule and cites the file and
section. Severity follows the rule's keyword: MUST / MUST NOT / NEVER / ALWAYS →
high, SHOULD → medium, MAY / prefer / consider → nit, no keyword → medium. Vague
prose ("write clean code") generates nothing. Formatting, whitespace,
import-order, and quote rules are skipped when a formatter or linter config
exists at the root — the tool enforces those, not the review.

The other convention files — `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`,
`.claude/rules/*.md` — still only **suppress**: a documented convention turns a
would-be finding into a non-finding, but never produces one.

## Scope

Reviews source files that carry human-authored comments / code. Skips JSON,
lockfiles, generated/minified files, Markdown/docs, config, and license headers.
Tests and infrastructure-as-code are reviewed by the craft lenses but not by
`performance`.

**This is a craft review plus a narrow security lens, not a security audit.** The
security lens looks for secrets, injection, access checks, boundary validation,
and insecure settings in source files; the performance lens raises diff-level
hypotheses it can point at a line. Neither is a dependency, config, or data-flow
audit: `.env` files, manifests, and lockfiles are not scanned, and a
vulnerability outside those shapes will surface only by accident. Do not read a
clean `/start-cr` report as "this change is safe" — run `/security-review` for
the rest.

With no path arguments it reviews the current branch diff. The base is detected
defensively (`@{upstream}` → `origin/main` → `origin/master` → `main` → `master`,
or `--base <branch>`), and both **committed** and **uncommitted** changes are
considered — when both exist, it asks which scope to review.

## Migration

`code-review` supersedes `comment-review` and `quality-review`, which are no
longer published in the `grixu/cc-toolkit` marketplace. If you still have either
installed, **uninstall it** to avoid duplicate skills: a user with both
generations installed sees two `comment-review` and two `quality-review` skills —
the new namespaced `code-review:comment-review` alongside the old
`comment-review:comment-review`.
