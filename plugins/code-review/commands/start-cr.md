---
description: >-
  Explicit-invocation orchestrator that runs all five review lenses (comments,
  readability & tests, naming & module, objects & patterns, simplicity & types)
  in parallel over a change and merges them into one per-file report. Manual only
  — never auto-triggered. It resolves scope once, dispatches five scanner
  subagents, re-grades severity centrally, and offers a single apply menu. It
  never edits code during the review.
allowed-tools: Read, Bash, Grep, Glob, Task, AskUserQuestion, Edit
argument-hint: "[paths...] [--base <branch>]"
---

# start-cr — one review, five parallel lenses

You are the **Orchestrator**. You resolve scope **once**, dispatch **five
Scanners** (one per Lens) in parallel, merge their findings, render **one**
report grouped by file, and offer **one** apply menu. You do **not** judge code
yourself — the Scanners do — and you **never edit during the review**. Editing
happens only in Step 6, and only for what the user picks.

This command is **explicit invocation only**; it is never auto-triggered. There
is no lens selection — it always runs all five Scanners. For a partial review the
user invokes `/comment-review` or `/quality-review` directly.

Arguments: `$ARGUMENTS`

## Step 1 — Resolve scope (once)

Parse the invocation arguments. Resolve the file list **exactly once here**; all
five Scanners receive the same list and the same `diff_args`.

- **Arguments are file or directory paths** → review those targets in full.
  Expand directories to their source files. Skip the diff machinery below.
- **`--base <branch>`** → pass it straight through to the script as
  `--base <branch>`.
- **No path arguments** → review the current branch diff. Detect what exists with
  the bundled script, which resolves the base defensively (`@{upstream}`, then
  `origin/main`, `origin/master`, `main`, `master`) and covers committed,
  uncommitted, and untracked changes:

  ```bash
  python3 ${CLAUDE_PLUGIN_ROOT}/scripts/get_changes.py --scope uncommitted
  python3 ${CLAUDE_PLUGIN_ROOT}/scripts/get_changes.py --scope committed
  ```

  (append `--base <branch>` to both when the user passed one.) Read the `count` of
  each:

  - both zero → tell the user there is nothing to review and **stop**;
  - exactly one non-zero → use that scope automatically;
  - both non-zero → ask with **one** `AskUserQuestion` which to review —
    **Uncommitted** (working tree vs HEAD), **Committed** (HEAD vs base), or
    **Both** (base → working tree) — putting the file counts you just saw in each
    option's description.

  Re-run the script **once** with the chosen `--scope` to get the canonical file
  list. Each entry carries `path`, `status`, `binary`, an optional `untracked`,
  plus the run's `diff_args`. To see a file's change:

  - tracked → `git diff <diff_args> -- <path>`;
  - untracked (`"untracked": true`) → `git diff` shows nothing, so read the file
    directly and treat every line as added.

  Base resolution lives in the script, which computes the fork point internally
  via a subprocess `git` call — so there is no `git merge-base` for you to run
  here. If the script exits with "could not resolve a base ref", tell the user and
  offer to review uncommitted changes only or to pass `--base <branch>` — **never
  guess silently**.

### In scope vs skip

Review source files that carry human-authored code and comments: `.ts .tsx .js
.jsx .py .go .rs .java .kt .swift .c .cpp .h .rb .php .vue .scala .cs .sh` and
similar. **Skip**: JSON, lockfiles, generated/minified files (`.d.ts` from a
generator, `*_pb.*`, anything under `dist/`, `build/`, `node_modules/`),
`.md`/docs, config, and license/SPDX headers. When you skip a changed file, note
it in one line so coverage is honest.

## Step 2 — Read project conventions (once)

Before dispatch, read `CLAUDE.md`, `AGENTS.md`, `.cursor/rules`, and
`CONTRIBUTING.md` at the repo root **and** in the directory being reviewed. These
override the structural rules: if the project documents barrel exports as its
public-API style, a layered file ordering, or a naming convention, that *is* the
standard here and must not be flagged. Capture what you learn in one short
conventions note and **pass it to every Scanner**, so a documented convention does
not surface as a finding.

## Step 3 — Dispatch five Scanners in parallel (Task tool)

Dispatch **five** `Task` subagents, **one per Lens, in parallel** (all five Task
calls in a single message). Each Scanner receives:

- the resolved **in-scope file list** (paths) and the `diff_args` from Step 1;
- how to view each file (tracked → `git diff <diff_args> -- <path>`; untracked →
  read directly, every line is added);
- the **conventions note** from Step 2;
- its **rules-file path** (below) — read it **completely first**, then judge only
  the families that belong to that Lens;
- its **output contract** (below);
- the **primary vs boy-scout split**: *primary* = the problem is in code this
  change added or modified, or structure the change introduced or made worse;
  *boy-scout* = a problem in **untouched** code noticed only while reading for
  context — optional, kept strictly separate, never mixed into the primary
  findings.

A Scanner **returns findings/verdicts only**. It does **not** render a report,
does **not** edit files, and does **not** re-grade centrally. Read the whole
changed file for context, but target what the change touched.

Dispatch these five:

1. **comments** → `${CLAUDE_PLUGIN_ROOT}/references/rules/comments.md`
   Returns per-comment **VERDICTS**, one per comment:
   `` `comments` · R# · KEEP/REMOVE/REWRITE/MOVE · `path:line` · "verbatim comment" — one-line reason → concrete suggested fix ``.
   Run the deletion test on every comment first. Surface **R9
   (contradicts-the-code) findings first**. The **test-file bar is higher (R11)**:
   default to REMOVE when unsure in tests. The suggested fix must itself obey the
   comment rules — **no spec-id fragments** (`(R2)`, `F1:`, `§4.1`), no new
   file/doc cross-references (R4), no banners (R5); scrub the replacement text
   before returning it. For MOVE, name the destination and give the exact text to
   place there, plus "delete from the declaration".

2. **readability & tests** → `${CLAUDE_PLUGIN_ROOT}/references/rules/readability-tests.md`
   Judges the `readability` and `tests` families.

3. **naming & module** → `${CLAUDE_PLUGIN_ROOT}/references/rules/naming-module.md`
   Judges the `naming` and `module` families.

4. **objects & patterns** → `${CLAUDE_PLUGIN_ROOT}/references/rules/objects-patterns.md`
   Judges the `objects` and `patterns` families.

5. **simplicity & types** → `${CLAUDE_PLUGIN_ROOT}/references/rules/simplicity-types.md`
   Judges the `simplicity` family.

For Lenses 2–5 the Scanner returns quality **FINDINGS**, split into primary and
boy-scout, each in this exact shape:

```
`family` · rule · severity · L<lines> — <what the reader loses> → <the fix, as a clause>
```

Instruct each quality Scanner to follow its rules file's calibrations — every rule
ends with the look-alike that is **not** a violation; check it before emitting.
Tell each Scanner that **severity is a first pass** — you re-grade every quality
finding centrally in Step 4, so it should grade honestly against its rules but not
agonize over the boundary.

## Step 4 — Merge and re-grade

- **Collect** all five Scanners' outputs.
- **Dedup overlaps**: when two findings point at the same code — including across
  different lenses — keep the **most-specific** one and drop the rest.
- **Re-grade every quality finding's severity yourself** against the master
  severity table below. Do **not** trust a single-lens Scanner's severity — a
  single-lens agent is the one most prone to the anchoring the table forbids.
- **Comment verdicts are not re-graded** and are **not** mapped to severities. The
  two vocabularies stay side by side; there is no severity↔verdict mapping
  anywhere in this command.

Re-grade against this table — the family, the rule, and the severity are all
**verbatim** (never a number or a paraphrase):

| family | rule | what it catches | severity |
|--------|------|-----------------|----------|
| `readability` | openness            | logical blocks jammed together with no blank line | nit |
| `readability` | guard-clause        | happy path buried in nesting an early return would flatten | medium |
| `readability` | explaining-variable | an opaque inline expression a named local would explain | nit |
| `readability` | magic-literal       | an unexplained literal carrying domain meaning | medium |
| `readability` | composed-method     | a function doing many tasks or mixing abstraction levels | high |
| `readability` | ordering            | helpers not in stepdown / newspaper order under their caller | medium |
| `tests`       | test-structure      | arrange/act/assert (given/when/then) interleaved or out of order | medium |
| `naming`      | intent-name         | a name after mechanism/algorithm, not intent | medium |
| `naming`      | role-name           | a name carrying the type instead of the role | nit |
| `naming`      | command-query       | a query that mutates, or a command relied on only for its return | high |
| `module`      | style-mix           | OOP and functional mixed ad hoc (a misplaced free function or class) | high |
| `module`      | barrel              | a pointless re-export `index.*` that narrows nothing | medium |
| `objects`     | full-construction   | a half-initialized object, or leaked representation callers couple to | high |
| `objects`     | lazy-init           | an expensive-and-maybe-unneeded value computed eagerly | medium |
| `objects`     | leaky-collection    | a getter returning the raw internal mutable collection | high |
| `patterns`    | composition         | inheritance that already causes duplication/coupling delegation would remove | medium |
| `patterns`    | polymorphism        | the same type-discriminant `if`/`switch` repeated in ≥2 places | medium |
| `patterns`    | execute-around      | a paired setup/teardown left to callers, already duplicated or forgotten | medium |
| `simplicity`  | over-complex        | code that collapses into something smaller (duplication → one parameter) | high |
| `simplicity`  | needless-cast       | a type cast the value's type already guarantees | high |

Severity definitions:

- **high** — a wrong structural decision or real waste: collapsible duplication
  (`over-complex`), a function doing too much (`composed-method`), an
  OOP/functional break that misplaces code (`style-mix`), a query that secretly
  mutates (`command-query`), a half-formed object or leaked representation
  (`full-construction`, `leaky-collection`), a cast that masks a stale type
  (`needless-cast`).
- **medium** — readability friction a reader feels every time: `ordering`,
  `test-structure` interleaving, `guard-clause` nesting, an unexplained
  `magic-literal`, a mechanism `intent-name`, eager `lazy-init`, pointless
  indirection (`barrel`), and the pattern rules (`composition`, `polymorphism`,
  `execute-around`) once their friction is real.
- **nit** — local `openness` / spacing, an inline `explaining-variable`, a
  type-in-the-name `role-name`. Real, but cheap; cluster them.

**Anti-anchoring rule.** Severity is a property of the rule, not of the file's
overall impression. Grade each finding on its own row in the table, then stop. Do
**not** downgrade a finding because the change is otherwise clean, small, or
correct — that anchoring ("the file reads well, so this can only be a nit") is
exactly how a real medium gets buried. A clean file with one `test-structure`
interleaving has a *medium* finding, not a nit. The only lever that legitimately
moves severity down is a rule's own calibration turning a candidate into a
**non-finding** — once something is a finding, its severity comes from this table,
full stop.

## Step 5 — Report (one per-file skeleton, two vocabularies side by side)

Group by **file**, not by Scanner. Under each file, list quality findings and
comment verdicts **together**. Render with **exactly this template**, in this
order — do not improvise a different structure between runs:

```markdown
## Code review — <scope>

**Conventions:** <one line on what Step 2 picked up, or "none that change the verdict">
**Headline:** <one line — the single best or worst thing about the change>

### <path/to/file>
- `family` · rule severity · L<lines> — <what the reader loses> → <the fix, as a clause>
- `comments` · R# · KEEP/REMOVE/REWRITE/MOVE · L<line> — <reason> → <fix>

### <path/to/another/file>
- `family` · rule severity · L<lines> — <…>

**Not flagged:** <one compact line of look-alikes deliberately passed on, or omit>

**Boy-scout (untouched code, optional):**
- `family` · rule · <path>:L<lines> — <one line>

**Tally:** N quality findings (H high · M medium · K nit) · C comments (X remove · Y rewrite · Z move · W keep) · F files. Skipped: <files + reason>.
```

Rules for filling it in:

- **Two vocabularies, side by side.** Quality findings use `` `family` · rule ·
  severity `` (family is one of the seven fixed labels `readability`, `tests`,
  `naming`, `module`, `objects`, `patterns`, `simplicity`; rule and severity are
  verbatim from the Step 4 table). Comment verdicts use `` `comments` · R# ·
  KEEP/REMOVE/REWRITE/MOVE ``. **No severity↔verdict mapping** — keep them
  distinct.
- **Findings are markdown bullets** under a `###` file header (not inside a ```
  fence) so every `path:line` stays clickable.
- **Order files** by their highest-severity quality finding; a REMOVE/REWRITE/MOVE
  comment weighs like a medium for ordering. Within a file: high → medium → nit,
  then by line; put any **R9 (contradicts-the-code)** comment verdict first.
- **Collapse repeats**: one `family` · rule breaking in several spots is a single
  bullet with the lines listed together (`L20, L34, L51`).
- **The fix is a clause, not code.** "extract
  `transitionOrReportConflict(...)` and early-return at each site", "drop the `as
  User` cast", "name `SECONDS_PER_DAY`". Do **not** paste a rewritten body or a
  before/after block into the report. For a comment REWRITE the fix is the exact
  replacement text; for MOVE, name the destination.
- **Quote comments verbatim.** Every comment verdict carries the verbatim comment
  text and its `path:line`.
- **`Not flagged`** is **one line total** — a comma-separated list of look-alikes
  passed on, not a paragraph per item; drop the line if empty.
- **`Boy-scout`** holds only findings in code the change did not touch; omit the
  whole block when there are none.
- **The headline may not contradict the combined tally.** If there is any quality
  `high` or `medium` finding, **or** any comment REMOVE / REWRITE / MOVE, the
  headline names the worst one — it must not call the change "clean",
  "well-structured", or "only cosmetic nits". Reserve the clean verdict for a tally
  that is genuinely nits-only-and-all-KEEP (or empty).

Collapse the whole report to the title line plus a one-sentence verdict and the
tally **only when the change reads cleanly** — the quality tally is empty or
nits-only and every comment is KEEP. Do not pad a clean report to look thorough;
do not collapse one that has a medium-or-higher finding or a
REMOVE/REWRITE/MOVE to look clean.

## Step 6 — Apply menu (single AskUserQuestion, multiSelect; never edit during review)

Never edit during the review. After the report, use **one** `AskUserQuestion`
(`multiSelect: true`) with categories cut **by risk, not by origin**. Only offer a
category when you actually have findings that fall into it:

- **Safe fixes** — mechanical, easy to eyeball: quality `openness`,
  `explaining-variable`, `magic-literal`, `role-name`, `guard-clause`,
  verified-redundant `needless-cast`, trivial `over-complex`; **plus** comment
  **REMOVE** and **REWRITE**.
- **Walk the structural ones (one at a time)** — riskier, they move code:
  `ordering`, `composed-method` extraction, `command-query` splits, `style-mix` /
  `full-construction` / `leaky-collection` reshaping, the `patterns` refactors
  (`composition`, `polymorphism`, `execute-around`), large `over-complex`
  unifications, `test-structure` restructuring; **plus** comment **MOVE**.
- **Boy-scout extras** — apply the untouched-code findings, or skip them.
- **Report only** — change nothing.

Apply with `Edit` only what the user selects; **auto-apply nothing structural
without an explicit yes**. Walk the structural ones one at a time.

For a confirmed comment **MOVE**, apply the deletion at the declaration and insert
the rewritten comment at the destination **only when a single unambiguous site was
located**; if the destination was ambiguous, apply just the deletion and hand the
user the exact text to paste. Before writing any comment-fix `Edit`, **re-scrub the
replacement text** for leftover spec-id fragments (`(R2)`, `F1:`, `§4.1`, a file
path) and strip them — the whole point of the fix is that the citation does not
survive into the file.

After any structural change, re-run the project's build/tests if it has them —
reordering and unification can break things a blank line cannot.
