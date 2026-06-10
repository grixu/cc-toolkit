# comment-review

A single-skill Claude Code plugin that does one thing: **review the comments in
your code** — not the logic, naming, or structure. It judges every comment
against a focused rule set and tells you which to keep, remove, rewrite, or move,
with a concrete suggested fix.

Default stance: *no comment beats a bad comment.* The skill biases toward
removal and only asks for a new comment where a future reader would genuinely be
stuck without one.

## Installation

From the `grixu/cc-toolkit` marketplace:

```
/plugin marketplace add grixu/cc-toolkit
/plugin install comment-review
```

## Usage

```
/comment-review                 # review comments in the current branch diff (committed + uncommitted)
/comment-review --base develop  # diff against an explicit base branch
/comment-review src/auth.ts     # review all comments in specific files
/comment-review src/ lib/       # review all comments under directories
```

You can also just ask in natural language: *"przejrzyj komentarze w tej zmianie"*,
*"review the comments in this PR"*.

The skill prints a per-file report (`path:line`, the quoted comment, the matched
rule, the verdict, and a suggested fix), then offers to apply the removals and
rewrites you confirm. It never edits during the review.

## The rules

Core comment-quality rules (R1–R7):

1. **No narrating *what* the code does** — code is for reading. *Exception:* a
   genuinely complex algorithm.
2. **Comments should explain *decisions* (the WHY).** *Exception:* don't demand
   a comment on obvious code or very common patterns.
3. **Not too long** — for non-algorithmic code, flag a comment longer than the
   code it annotates or over ~2 sentences; trim to the load-bearing line.
4. **No references to other files or documentation** — they rot and hide
   coupling. *Exception:* a stable, pinned reference (RFC, spec, pinned URL).
5. **No banner / section-divider comments** (`// ===== PERFORMANCE =====`).
6. **No change-state / history comments** — PR/ticket numbers, "previously",
   "changed from", "was X now Y". That belongs in version control. *Exception:*
   a still-open TODO warning of a present-day landmine.
7. **No process-narration disguised as a decision** — a comment that looks like
   a rationale but just re-describes how a value is built. *Exception:* keep it
   when it's critical to correctness, very complex, or security-relevant.

Plus extra checks:

8. **No commented-out code** — dead code belongs in version control, not parked
   in a comment.
9. **No comment that contradicts the code** — a comment that lies about what the
   code does is the most urgent fix; these are surfaced first.
10. **Consistent with the file's commenting style** — a lone trivial doc among
    bare siblings of the same kind almost always marks low-value prose.
11. **In test files, the bar is much higher** — comments restating an assertion
    or the implementation under test go; only structural/scenario labels stay.
12. **Rationale belongs where the behavior lives** — a genuine *why* pinned to a
    declaration (enum member, constant, field) while it explains a method's
    behavior elsewhere is **moved** to that method, or **removed** if the reason
    is already there. *Contrast:* a note about the value's own meaning
    (`// 0 means unbounded`) stays on the declaration.

The skill also calibrates against false positives: self-documenting markup,
real ASCII diagrams, present-tense TODO landmines, genuine ordering invariants,
test scaffolding, and idiomatic doc comments (godoc / docstrings / JSDoc / Rust
`///`) are not wrongly flagged.

## Scope

Reviews source files that carry human-authored comments. Skips JSON, lockfiles,
generated/minified files, Markdown/docs, and license headers.

With no path arguments it reviews the current branch diff. The base is detected
defensively (`@{upstream}` → `origin/main` → `origin/master` → `main` → `master`,
or `--base <branch>`), and both **committed** and **uncommitted** changes are
considered — when both exist, the skill asks which scope to review.
