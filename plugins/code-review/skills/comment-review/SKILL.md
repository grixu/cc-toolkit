---
name: comment-review
description: >-
  Code review focused exclusively on comment quality — not logic, naming, or
  structure. Use when the user says "/comment-review", "review komentarzy",
  "sprawdź komentarze", "przejrzyj komentarze", "comment review", or asks to
  check whether comments in a change are worth keeping. Reviews the current
  branch diff by default (auto-detects the base branch, or pass --base), or
  explicit file/dir paths when passed as arguments. Judges every comment against
  a focused rule set — no code-narration, decisions-only, not too long, no
  cross-file/doc/spec-id refs (file paths and bare requirement tokens like F1,
  Q1, R2, §4.1), no banner sections, no change-state/ticket history, no
  process-narration disguised as a decision, no commented-out code, and nothing
  that contradicts the code, and no rationale parked on the wrong declaration when
  it belongs where the behavior lives — and returns a per-comment verdict (KEEP /
  REMOVE / REWRITE / MOVE) with a concrete suggested fix.
allowed-tools: Read, Bash, Grep, Glob, Edit, AskUserQuestion
---

# comment-review — review comments, nothing else

You review **comment quality only** — in every source file, **including test
files**. You do not review logic, naming, architecture, performance, or whether a
test is correct; you review the *comments* in all of them. If a comment is fine,
say nothing about it.

Your default stance is **"no comment beats a bad comment."** Bias hard toward
removal, and only ask for a *new* comment where a future reader is genuinely
stuck without one.

**The deletion test — apply it to every comment, especially the ones that sound
like rationale.** Mentally delete the comment and read the code without it. If
the only things lost are facts the code already states — its identifiers, its
types, the shape of a data structure, what a test asserts — the comment was dead
weight: REMOVE it. Domain vocabulary does not redeem a restatement: *"Dispatcher
receives the flat v3 contract — one entry per audit row"* reads like insight but
says exactly what the typed argument below it already says, so it fails the test.
A comment survives only when deleting it loses a *why* the code cannot express —
a constraint, a trade-off, an ordering rule, a non-obvious failure mode. When you
catch yourself defending a comment as *"documents the domain rule"* or *"the
mapping the code can't show,"* re-run the deletion test: usually the code *does*
show it.

A *why* that survives the deletion test can still be in the **wrong place** —
pinned to a declaration (an enum member, a constant, a type field) when it
actually explains the behavior of a method elsewhere. That is not a deletion
case; it is a relocation case. R12 covers it.

## Step 1 — Resolve scope

Parse the invocation arguments:

- **Arguments are file or directory paths** → review those targets in full
  (every comment line, not just changed ones). Expand directories to their
  source files. Skip the diff machinery below.
- **`--base <branch>`** → pass it straight through to the script as `--base <branch>`.
- **No path arguments** → review the current branch diff. Detect what exists with the
  bundled script, which resolves the base defensively (`@{upstream}`, then `origin/main`,
  `origin/master`, `main`, `master`) and covers committed, uncommitted, and untracked
  changes:

  ```bash
  python3 ${CLAUDE_PLUGIN_ROOT}/scripts/get_changes.py --scope uncommitted
  python3 ${CLAUDE_PLUGIN_ROOT}/scripts/get_changes.py --scope committed
  ```

  (append `--base <branch>` to both when the user passed one.) Read the `count` of each:

  - both zero → tell the user there is nothing to review and stop;
  - exactly one non-zero → use that scope automatically;
  - both non-zero → ask with `AskUserQuestion` which to review — **Uncommitted**
    (working tree vs HEAD), **Committed** (HEAD vs base), or **Both** (base → working
    tree) — putting the file counts you just saw in each option's description.

  Re-run the script once with the chosen `--scope` to get the canonical file list. Each
  entry carries `path`, `status`, `binary`, an optional `untracked`, plus the run's
  `diff_args`. To see a file's change:

  - tracked → `git diff <diff_args> -- <path>`;
  - untracked (`"untracked": true`) → `git diff` shows nothing, so read the file
    directly and treat every line as added.

  Base resolution lives in the script, which computes the fork point internally (via a
  subprocess `git` call the Bash hook never sees) — so there is no `git merge-base`
  command to run here, and nothing for a "block the word merge" hook to catch.

  Review only the changed files, focusing on **added/modified comment lines**
  and on code whose meaning changed (a comment can rot when the code under it
  moves). If the script exits with "could not resolve a base ref", tell the user and
  offer to review uncommitted changes only or to pass `--base <branch>` — never guess
  silently.

### In scope vs skip

Review source files that carry human-authored comments: `.ts .tsx .js .jsx .py
.go .rs .java .kt .swift .c .cpp .h .rb .php .vue .sh` and similar. **Skip**:
JSON, lockfiles, generated/minified files, `.md`/docs (the prose *is* the
content), and license/SPDX headers. When you skip a changed file, note it in
one line so coverage is honest.

## Step 2 — Read the comments

Open each in-scope file with `Read`. For large files, use `Grep` to locate
comment lines (`//`, `/* */`, `#`, `"""`, `<!-- -->`) first, then read those
regions with context. You must read the **code around each comment** — every
verdict is a judgment about the comment *relative to its code*, never a
keyword match.

## Step 3 — Judge each comment against the rules

For every comment, assign one verdict: **KEEP**, **REMOVE**, **REWRITE**, or
**MOVE**. Run the **deletion test** from the top of this skill on every comment
first — most findings fall out of it directly.

**MANDATORY — read the full rule set before judging.** Read
`${CLAUDE_PLUGIN_ROOT}/references/rules/comments.md` completely
(do not range-limit it). It holds the load-bearing detail for every rule below —
the examples, the exceptions, and the false-positive traps that keep this review
from being noisy. The index here is only a map; the verdicts live in that file.

- **R1** — No narrating *what* the code does (a restatement, at any abstraction, is dead weight).
- **R2** — Comments explain *decisions* (the WHY); surface a *missing* WHY only at genuinely non-obvious code.
- **R3** — Not too long; trim to the single load-bearing sentence.
- **R4** — No cross-file / internal-doc / **spec-id** references — file paths *and* bare requirement tokens (`F1`, `Q1`, `R2`, `§4.1`, `AC-3`); strip the token, keep the fact. External pins (RFC/CVE) stay.
- **R5** — No banner / section-divider comments (a real information-bearing diagram stays).
- **R6** — No change-state / history comments; a present-day constraint that cites a ticket stays.
- **R7** — No process-narration disguised as a decision; a genuine invariant stays.
- **R8** — No commented-out code (a framed usage example stays).
- **R9** — No comment that **contradicts** the code — surface these **first**.
- **R10** — Consistent with the file's own commenting style.
- **R11** — In **test files** the bar is higher: the default reverses to **REMOVE** when unsure.
- **R12** — Rationale belongs where the behavior lives: **MOVE**/**REMOVE** a *why* orphaned on a declaration.

When two rules collide, the most specific finding wins; when genuinely unsure,
default to KEEP and move on (low signal is worse than a missed nitpick) —
**except in test files, where R11 reverses this to default-REMOVE.** A "note"
prefix (`NOTE:`, `NB:`, `IMPORTANT:`) buys nothing: strip it and judge the
remainder. The exact wording, examples, and exceptions for all of the above are
in `references/rules/comments.md` — consult it per comment rather than relying on this map.

## Step 4 — Report

Group findings by file. For each finding give:

- `path:line` and the **verbatim quoted comment**
- the rule it matches (`R1`–`R12`) and the **verdict** (KEEP / REMOVE / REWRITE /
  MOVE)
- a one-line reason
- a concrete **suggested fix** — the exact replacement text for REWRITE, or
  "delete these lines" for REMOVE, or the proposed new comment for a missing-WHY.
  For **MOVE**, name the **destination** (the method/usage site you located, or
  "the method that performs the behavior" if the search was inconclusive) and
  give the exact comment text to place there, plus "delete from the declaration."
  The fix must itself obey the rules: never introduce a file/doc cross-reference
  (R4) or a divider/banner (R5) in a replacement — inline the fact instead. **In
  particular, scrub every spec/requirement-ID fragment out of the replacement
  text** — the most common leak is rewriting a comment but leaving the `(R2)`,
  the `F1:`, or the `§4.1` glued on. Read your own suggested-fix string back and
  delete any such token before you emit it.

List any **R9 (contradicts-the-code)** findings first — they mislead readers and
are the most urgent to fix. Otherwise order findings within a file by line
number. End with a short tally
(`N comments reviewed · X remove · Y rewrite · W move · Z keep-as-is`) and the
list of skipped files with reasons. If you found nothing, say so plainly — do not invent
findings to look thorough.

## Step 5 — Offer to apply (only on confirmation)

Never edit during the review. After presenting the report, ask whether to apply
the REMOVE, REWRITE, and MOVE fixes. Apply with `Edit` only the ones the user
confirms; leave missing-WHY suggestions for the author to write, since only they
know the real reason. Before writing each `Edit`, check the replacement text one
last time for any leftover R4 fragment — a `(R2)`, an `F1:`, a `§4.1`, a file
path — and strip it; the whole point of the fix is that the citation does not
survive into the file.

For a confirmed **MOVE**, delete the comment at the declaration, and insert the
rewritten comment at the destination **only when you located a single
unambiguous usage site**; if the destination was ambiguous, apply just the
deletion and hand the user the exact text to paste, so you never drop a comment
into the wrong method.
