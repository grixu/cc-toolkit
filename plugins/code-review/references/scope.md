# Review scope policy — what gets judged, what gets skipped, what a language changes

Shared by `/start-cr` and the standalone `comment-review` / `quality-review` skills, so
the three agree on coverage. How the file list is *resolved* (the diff script, the
scope choice) stays in each surface; this file covers what to do with the list once you
have it.

## In scope

Source files that carry human-authored code and comments: `.ts .tsx .js .jsx .py .go
.rs .java .kt .swift .c .cpp .h .rb .php .vue .scala .cs .sh`, plus
**infrastructure-as-code** (`.tf`/HCL and similar declarative surfaces that still carry
comments and structure worth reviewing).

## Skip

JSON, lockfiles, generated or minified files (a generator's `.d.ts`, `*_pb.*`, anything
under `dist/`, `build/`, `node_modules/`), `.md` and docs (in a comment review the prose
*is* the content), **static config data** (`.yaml`/`.toml`/`.ini` settings, `.env`), and
license/SPDX headers.

Note every skipped file in one line, so coverage stays honest.

**A skipped file that is the substance of the change gets its own sentence.** A
dependency manifest (`package.json`, `composer.json`, …) on a dependency-bump or upgrade
branch is the whole point of that diff. Say so explicitly rather than burying it in the
skip list: its dependency changes aren't line-graded, and the reader should read that as
a deliberate scope boundary rather than an oversight.

## Language applicability

The rule families are written against imperative, object-oriented code (mostly JS/TS).
When the change targets a language where a family has no counterpart, clear that family
in one line instead of inventing findings to fit it.

- **HCL/Terraform** and other declarative infrastructure-as-code: no module system
  (`module`), no object construction (`objects`), no type casts (`needless-cast`), and
  no tests inside the config itself (`tests`).
- **SQL, protobuf, plain config-as-code**: similar.

A family that *does* have a counterpart stays in play — `naming`, `comments`,
`readability`, and duplication (`over-complex`) apply almost everywhere. Clear a family
on language grounds only, never a whole lens.

## Project conventions override these rules

Gather conventions **mechanically, by exact path** — not by eyeballing an `ls`, which is
how the repo-root files (the ones that most often carry the decisive rule) get skipped.
Work this fixed order and Read each path that exists:

1. **Repository root, always first:** `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`,
   `.cursor/rules`. Read these before anything directory-level; a dir-level file never
   stands in for the root, and the harness's auto-load never stands in for reading it
   yourself.
2. **The directory chain:** for each reviewed file, walk root → its directory and Read
   any `CLAUDE.md` / `AGENTS.md` along the way.
3. **Rule files:** every file matched by `.claude/rules/*.md` at the root, and the same
   glob inside a reviewed subtree that carries its own.

What they document is the standard here. If the project documents barrel exports as its
public-API style, a layered file ordering, a naming convention, or a sanctioned
anchor-comment prefix (e.g. `AGENTS-NOTE:`), that is not a finding — a rule you would
otherwise raise becomes a non-finding when the project has deliberately chosen it.
Capture what you picked up in one short conventions note.
