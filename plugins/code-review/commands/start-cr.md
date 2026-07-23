---
description: >-
  Explicit-invocation orchestrator that runs all five review lenses (comments,
  readability & tests, naming & module, objects & patterns, simplicity & types)
  in parallel over a change and merges them into one per-file report. Manual only
  — never auto-triggered. It resolves scope once, dispatches five scanner
  subagents, re-grades severity centrally, and offers a single apply menu. It
  never edits code during the review.
allowed-tools: Read, Bash, Grep, Glob, Agent, AskUserQuestion, Edit
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

## Step 3 — Dispatch five Scanners in parallel

Dispatch the five Scanners — **one per Lens** — so they run concurrently. The `Agent`
tool **defaults to background**, so the preferred foreground fan-out only happens when
you pass `run_in_background: false` **and** emit all five calls in a **single message**;
separate messages run foreground Scanners one-at-a-time (serial — the slow path). Run
that way, each Scanner returns its findings directly as its result.

Background is an acceptable fallback when you don't batch into one message: the Scanners
still run concurrently and each delivers via a completion notification — **wait for the
notifications, never poll with `SendMessage`**. Either path, merge only once all five
have reported. Each Scanner receives:

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
  findings. A **fully added file** (status `A`) has no boy-scout findings — every
  finding in it is primary, because the whole file is code the change introduced.

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

**Severity is exactly one of `high`, `medium`, or `nit`** — never `low`, never a
number, never a paraphrase. A Scanner whose own rules file happens to list only one
of the three still uses the full vocabulary.

**The FINDINGS section holds findings only.** Anything a Scanner checked and cleared
belongs in one prose line, never in the finding shape — a "none found" or "is **not**
a finding" bullet with a dash where the severity goes reads as a finding to everything
downstream.

Instruct each quality Scanner to follow its rules file's calibrations — every rule
ends with the look-alike that is **not** a violation; check it before emitting.
Tell each Scanner that **severity is a first pass** — you re-grade every quality
finding centrally in Step 4, so it should grade honestly against its rules but not
agonize over the boundary.

**A duplication finding sweeps the whole file.** "Target what the change touched" holds
for most rules, but duplication is the exception: when you flag repeated code (an
`over-complex` duplication, a copy-pasted predicate), scan the **rest of the file** for
every other copy of the same pattern and list all the call sites in the one finding —
including copies in code the change didn't touch. A finding that names two of three
copies makes the extraction fix leave a straggler behind.

**Two conventions every Scanner uses:**

- **`(verify)` marker** — a Scanner that doubts a finding **resolves it itself first**:
  you have `Read`, so open the type, the signature, or the call site and confirm or
  drop it (a `needless-cast` is the common case — check what the value's type actually
  is before claiming the cast is redundant). Append `(verify)` only when confirming
  would take something you don't have — runtime behaviour, or a file outside the review
  scope. Then the Orchestrator resolves it in Step 4. Never silently keep an unverified
  finding.
- **`HANDOFF` block** — a real problem that belongs to another Lens's family goes in a
  separate block at the end of your output, never mixed into your own findings and
  never buried in prose:

  ```
  ## HANDOFF (out-of-my-family — noticed but not mine to grade)
  - `<suggested-family>` · <rule if known> · `path:line` — <what the reader loses> → <why it isn't my family>
  ```

  One terse line each, with the family you think owns it. Omit the block when empty.

## Step 4 — Merge and re-grade

- **Collect** all five Scanners' outputs.
- **Dedup overlaps**: when two findings point at the same code — including across
  different lenses — keep the **most-specific** one and drop the rest.
- **Count the lenses that converged.** Independent Scanners landing on the same code
  is the strongest signal this review produces — they read the file separately and had
  no way to coordinate. Treat a finding several lenses reached (directly or via
  `HANDOFF`) as **confirmed**: it leads its file, and it is a candidate for the
  headline. Convergence raises confidence and ordering, **never severity** — that stays
  verbatim from the table.
- **Route every `HANDOFF` entry**: assign it the correct family and rule, grade its
  severity from the master table, dedup it against the existing findings, and fold it
  into the per-file report. A `HANDOFF` must never be dropped or left only as prose.
- **Resolve every `(verify)` finding**: read the code and confirm or refute it. A
  confirmed finding drops the marker and proceeds; a refuted one is a **Scanner false
  positive** — drop it and note it under `Not flagged`. **Never carry an unresolved
  `(verify)` finding into an apply batch.** Most runs will have none — the Scanners
  resolve their own doubts. When no Scanner emitted one, say nothing about `(verify)`
  anywhere; do not claim to have resolved an empty list.
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
| `tests`       | test-fidelity       | a test's name or fixture claims a boundary its assertions don't actually check | medium |
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
- **medium** — readability friction a reader feels every time, or a latent gap that
  matters: `ordering`, `test-structure` interleaving, a `test-fidelity` name/fixture
  that claims more than its assertions check, `guard-clause` nesting, an unexplained
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

**Severity self-check.** Before rendering, verify that every quality finding's
severity equals its rule's row in the table above, and that no rule appears with two
different severities anywhere in the report. A mismatch is a bug — fix it. The only
lever that legitimately changes an outcome is a rule's own calibration turning a
candidate into a non-finding, never a per-file severity nudge.

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

**Not flagged:** <look-alikes deliberately passed on — one compact line, or a bullet
each when one is a real problem with no rule to land on; omit when empty>

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
- **`Not flagged`** lists the look-alikes deliberately passed on — one line when they
  are all genuine non-findings, a short bullet each when one of them is a *real*
  problem that merely has no rule to land on. Never compress a real problem into a
  subordinate clause to keep the line short; that is how something worth acting on
  disappears. Drop the block if empty.
- **`Boy-scout`** holds only findings in code the change did not touch; omit the
  whole block when there are none.
- **Resolved findings only.** Every `(verify)` finding must have been confirmed or
  refuted in Step 4 before the report — list only confirmed findings in the body; a
  refuted one goes in `Not flagged` as a Scanner false positive.
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
category when you actually have findings that fall into it. **`AskUserQuestion`
accepts at most four options** — the four canonical risk buckets below are the whole
menu; never add a fifth. `Report only` is always offered; a finding that doesn't fit
cleanly goes to the nearest bucket (a mechanical test retitle → Safe fixes):

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
without an explicit yes**.

**The safe batch contains only verified findings.** Never place an unverified
`(verify)` finding — a `needless-cast` above all — into the safe batch or dispatch it
to an editor; it must have been confirmed in Step 4 first (a refuted one was already
dropped there).

**Scanner line numbers are estimates, not ground truth.** A finding's `path:line`
is where the Scanner *thought* the code sat; before each edit, Read the file and
locate the exact site by its **content**, not its line number. If the code or
comment a finding describes is not actually there, it is a **Scanner false
positive** — skip it and note it in the wrap-up. Never edit a nearby line to force
the match.

**Split the safe batch across editor subagents by what you have already read.** An
editor pays a full file read before its first `Edit`, so fanning out a file you
already hold in context buys nothing and costs that read twice. Count the safe-batch
files you have **not** read in this session: **four or more → fan out** (those files
only); **three or fewer → apply the whole batch inline**. Files you already read in
Step 4 stay with you either way.

When you do fan out, do not apply them one-by-one yourself — **partition those files
into a handful of balanced groups and dispatch one `Agent` editor per group, in a
single message and in the foreground (`run_in_background: false`)**, so they run
concurrently and each returns its per-file applied/skipped summary directly.
**Never background an editor** —
background spins up the heavier agent-teams/mailbox path and forces you to poll for
results. Ownership is **disjoint by file**: never let two editors touch the same file
(concurrent `Edit`s to one file race). Each editor receives its file subset, the exact
approved fix for every site in those files, the Step 2 conventions note, and these
invariants — locate each site by content before editing (per the estimate rule
above), re-scrub every replacement, apply nothing beyond the listed fixes, and
**do not run build/tests** (you run them once, after). Each returns what it applied
per file and what it skipped, with the reason. Run the editors to completion first,
then walk the structural fixes.

**Walk the structural fixes yourself, one at a time — never fan these out.** They
move code, must be sequenced, and are verified by build/tests, so they stay under
your control even when the safe batch is parallelized.

For a confirmed comment **MOVE**, apply the deletion at the declaration and insert
the rewritten comment at the destination **only when a single unambiguous site was
located**; if the destination was ambiguous, apply just the deletion and hand the
user the exact text to paste. Before writing any comment-fix `Edit`, **re-scrub the
replacement text** for leftover spec-id fragments (`(R2)`, `F1:`, `§4.1`, a file
path) and strip them — the whole point of the fix is that the citation does not
survive into the file.

Once every edit has landed — inline, from the editor subagents, and from the
structural walk — re-run the project's build/tests if it has them, **once**:
reordering and unification can break things a blank line cannot. Then aggregate
what each editor applied or skipped into the wrap-up.
