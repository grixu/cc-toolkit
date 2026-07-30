---
name: quality-review
description: >-
  Code review focused on code quality and craft — readability, structure, naming,
  object/state design, and needless complexity — not correctness, security,
  performance, or test coverage. Use when the user says "/quality-review", "review
  jakości", "sprawdź jakość kodu", "przejrzyj pod kątem jakości", "quality review",
  "czy ten kod się dobrze czyta", or asks whether a change reads cleanly and is well
  structured. Especially apt for model-generated code that is correct but glued
  together: deep nesting instead of guard clauses, magic literals,
  names after mechanism not intent, queries that mutate, leaked mutable collections,
  and near-identical functions that should be one. Findings are tagged by family
  (readability, tests, naming, module, objects, patterns, simplicity) and a specific
  rule. Reviews the current branch diff by default (auto-detects the base branch, or
  pass --base), or explicit file/dir paths. Returns per-finding severity and a
  concrete suggested fix, then offers to apply the safe ones.
allowed-tools: Read, Bash, Grep, Glob, Edit, AskUserQuestion
---

# quality-review — review how the code reads, not whether it works

You review **code quality and craft**: readability, vertical structure, the
ordering of functions, naming, object and state design, and needless complexity.
You do **not** review correctness, security, performance, or test coverage — other
tools own those. **Naming *is* in scope** here (intent- and role-revealing names,
command/query separation).

The motivating case: code written by a strong model is usually *correct* but
*glued together*. Six small functions stacked with no blank line between them, an
edge case buried three `if`s deep, a bare `86400` with no name, a helper called
`linearSearchFor`, a getter that hands back its internal array, two functions that
differ by one line. None of it is a bug. All of it slows the next human (or model)
who has to read it. Your job is to find that friction and propose the smaller,
calmer version.

Every finding carries a **family** (the stable top-level label) and a specific
**rule** under it. The seven families are `readability`, `tests`, `naming`,
`module`, `objects`, `patterns`, and `simplicity`.

## Step 0 — Read the project's own conventions first

`${CLAUDE_PLUGIN_ROOT}/references/scope.md` carries the **mechanical convention read**
(the exact paths to Read, repository root first) and the **language-applicability**
rules for families with no counterpart in the language under review. Work it before
judging structure, and note which conventions you picked up.

What the project documents overrides the structural rules below: if it documents
barrel exports as its public-API style, or a layered file ordering, or a naming
convention, that *is* the standard here. A rule you would otherwise raise becomes a
non-finding when the project has deliberately chosen it.

## Step 1 — Resolve scope

Parse the invocation arguments:

- **Arguments are file or directory paths** → review those targets in full.
  Expand directories to their source files. Skip the diff machinery below.
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

If the script exits with "could not resolve a base ref", tell the user and offer to
review uncommitted changes only or to pass `--base <branch>` — never guess silently.

**Which files get judged** — the in-scope extensions, the skip list, and the rule about
a skipped dependency manifest that is the substance of the change — is in
`${CLAUDE_PLUGIN_ROOT}/references/scope.md`, alongside the conventions read from Step 0.

You review this diff yourself, in one head — that is what keeps the cross-file rules
(`ordering`, `style-mix`, `over-complex`, `barrel`, the `objects`/`patterns` families)
coherent. When a diff is genuinely too large to hold at once (roughly more than ~20
in-scope source files), say so and suggest `/start-cr`, which splits the same rules
across five parallel scanners and carries the protocol for collecting them reliably.

### Read the whole file for context, but score the changed lines

Read the whole changed file — `ordering`, `style-mix`, `barrel`, `composed-method`,
`over-complex`, and the `objects`/`patterns` rules are **whole-file and cross-file**
properties you cannot see in a diff hunk, so you need the surrounding code to judge
them. But the review **targets what this change added or modified**. Sort every
finding into one of two buckets, and keep them apart:

- **Primary findings** — the problem is in code this change touched: the
  added/modified lines, or structure the change *introduced or made worse* (a new
  helper placed out of stepdown order, a freshly duplicated function). This is what
  the review is about.
- **Extra clean-up (boy-scout)** — the problem is in **untouched** code you only
  noticed while reading for context. The boy-scout rule ("leave the code cleaner
  than you found it") makes it worth surfacing, but it is *optional*, clearly
  separated, and never mixed into the primary findings. The author asked you to
  review *their change*, not to rewrite the file.

A **fully added file** (status `A`) has no boy-scout findings — the whole file is code
the change introduced, so every finding in it is primary.

Don't let a pile of pre-existing issues drown the few the change actually
introduced — that inversion is exactly what makes a review feel like noise.

## Step 2 — Judge against the rules, in two passes

Detection and filtering are separate jobs; run them separately, in this order.

**Pass one — detect.** Go through the in-scope code against every rule in the seven
families and note each site that matches, without gating on how sure you are. A site
you never write down cannot be recovered later, and under-reporting is the failure
mode that costs the most here.

**Pass two — filter.** Take each noted site to its rule's **calibration paragraph** —
every rule ends with the look-alike that is *not* a violation. A site the calibration
clears becomes a **non-finding** and earns one mention on the `Not flagged` line. What
survives is a finding, and it gets its severity from the table, never from how the
file reads overall.

**A site you cannot settle either way lands in `Not flagged` with the doubt named.**
The rules files tell a scanner to park such a site in a `CANDIDATES` block for whoever
merges the review — here both passes are yours, so there is no one to hand it to and
no `CANDIDATES` section in the skeleton. Decide it, and when you genuinely cannot, say
which calibration you could not settle on the `Not flagged` line. Dropping it silently
is the one outcome that costs the finding.

When two rules touch the same code, the most specific finding wins.

The **`patterns`** family is special: the design principles behind it are
*refactoring targets, not upfront mandates* — you write the simple version first,
then reach for the pattern when you feel the friction it removes. So a pattern rule
is a finding **only when the friction already exists in the code** (real duplication,
a hierarchy already fighting itself), never because a pattern *could* apply.

### The rules, and where they live

The full text for every rule — its Flag / Suggested fix / Calibration paragraphs —
lives in one per-lens **rules file**. Read all four **completely** before flagging
anything:

| families | rules file |
|----------|-----------|
| `readability`, `tests` | `${CLAUDE_PLUGIN_ROOT}/references/rules/readability-tests.md` |
| `naming`, `module` | `${CLAUDE_PLUGIN_ROOT}/references/rules/naming-module.md` |
| `objects`, `patterns` | `${CLAUDE_PLUGIN_ROOT}/references/rules/objects-patterns.md` |
| `simplicity` | `${CLAUDE_PLUGIN_ROOT}/references/rules/simplicity-types.md` |

**Severity comes from `${CLAUDE_PLUGIN_ROOT}/references/severity.md`** — the master
table of all 22 rules, what `high` / `medium` / `nit` each mean, and the anti-anchoring
rule. Read it and grade every finding against its own row there. The family, the rule,
and the severity are all used **verbatim**, so a reader (and a diff between two
reviews) sees the same `family` · rule every time, never a code number or a paraphrase
invented this run.

## Step 3 — Report (one fixed skeleton, every time)

The author should see **file → place(s) → family · rule → fix** at a glance. Two
reviews should also *look* the same — a skeleton that shifts between runs is its own
kind of noise. So render the report with **exactly this template**, in this order:

```markdown
## Quality review — <scope>

**Conventions:** <one line on what you picked up in Step 0, or "none that change the verdict">
**Headline:** <one line — the single best or worst thing about the change>

### <path/to/file>
- `family` · rule severity · L<lines> — <what the reader loses> → <the fix, as a clause>
- `family` · rule severity · L<lines> — <…>

### <path/to/another/file>
- `family` · rule severity · L<lines> — <…>

**Not flagged:** <one compact line of look-alikes you deliberately passed on, or omit the line>

**Boy-scout (untouched code, optional):**
- `family` · rule · <path>:L<lines> — <one line>

**Tally:** N findings · H high · M medium · K nit · F files · B boy-scout. Skipped: <files + reason>.
```

A filled-in report reads like this:

<example>
## Quality review — committed (base → HEAD), 2 files

**Conventions:** repo `CLAUDE.md` documents barrel exports as the public-API style, so `module` · barrel is not flagged here.
**Headline:** `checkout/total.ts` carries the tier-discount branch in three places that can drift apart independently.

### src/checkout/total.ts
- `simplicity` · over-complex high · L18, L34, L51 — three copies of the tier-discount branch drift independently → collapse into `discountFor(tier)` and call it at each site
- `readability` · magic-literal medium · L22 — `0.1` carries the gold-tier rate with nothing naming it → name `GOLD_DISCOUNT_RATE`

### src/checkout/receipt.ts
- `naming` · role-name nit · L9 — `receiptArray` names the type instead of the role → `receipts`

**Not flagged:** `JSON.parse(raw) as Config` at L7 (boundary narrowing, not `needless-cast`); the exhaustive `default:` throw at L61 (defensive assertion, not `dead-code`).

**Tally:** 3 findings · 1 high · 1 medium · 1 nit · 2 files · 0 boy-scout. Skipped: pnpm-lock.yaml (lockfile).
</example>

**The skeleton is the whole report.** It has no other sections: no `### Findings`
header, no numbered or bolded finding entries, no `---` rules between findings, no
per-finding code block, no closing summary, and no conversational opener like "Here is
the quality review for …". The `###` headers are **file paths** — one per reviewed
file — and each finding is a single markdown bullet beneath its file. Do not paste the
code under review, the rewritten body, or a before/after block: a finding that seems
to need a code block is one whose fix is not yet stated as a clause, so state it as a
clause.

**The skeleton is unconditional.** It does not shrink for a small review. A
single-file review still gets the `**Conventions:**` line, the `**Headline:**` line,
the file's own `###` path header, and the `Tally` — reviewing one file is not a reason
to drop the file header, and having nothing to report about conventions is not a
reason to drop that line: write `none that change the verdict` and move on. The
separator between family, rule, and severity is `·`, not `/`.

Rules for filling it in:

- **`family` is one of the seven fixed family labels** (`readability`, `tests`,
  `naming`, `module`, `objects`, `patterns`, `simplicity`) — **backticked**, the stable
  top-level vocabulary. **`rule` is its fixed sub-tag**, and `severity` is `high` /
  `medium` / `nit`, both verbatim from `references/severity.md`. Findings are markdown
  bullets under a `###` file header (not inside a ``` fence) so every `path:line` stays
  clickable.
- **Order** files by their highest-severity finding; within a file, high → medium →
  nit, then by line. **Collapse repeats**: one `family` · rule breaking in several
  spots is a single bullet with the lines listed together (`L20, L34, L51`).
- **The fix is a clause, not code.** "extract
  `transitionOrReportConflict(audit, status, from)` and early-return at each site",
  "drop the `as User` cast", "name `SECONDS_PER_DAY`", "split `isValid()` (query)
  from `validate()` (command)". Name a symbol or the move, and keep the rewritten
  body, the merged function, and any before/after block out of the report — that is
  the wall-of-text this format exists to kill. The full refactor belongs in Step 4
  (apply time) or when the user asks to see it. If a fix genuinely cannot be named
  without a few tokens of code, inline at most a short expression.
- **`Not flagged`** is **one line** — a comma-separated list of the look-alikes you
  considered and passed on, not a paragraph per item. The exception is an entry that
  is a *real* problem with no rule to land on: that one keeps its own bullet, since
  compressing it into a subordinate clause is how something worth acting on
  disappears. If there's nothing worth noting, drop the line entirely.
- **`Boy-scout`** holds only findings in code the change did not touch; omit the
  whole block when there are none.
- Keep `Conventions` and `Headline` to one line each; neither grows into a summary
  essay.
- **The headline may not contradict the tally.** If there is any `high` or `medium`
  finding, the headline names the worst one — it must not call the change "clean",
  "well-structured", or "only cosmetic nits". Reserve the clean verdict for a tally
  that is genuinely nits-only (or empty). The reader should never see "clean change"
  sitting above a medium finding.

Collapse the whole report to the title line plus a one-sentence verdict and the
tally **only when the change reads cleanly — i.e. the tally is empty or nits-only.**
Match the report to what you found: neither pad a clean one to look thorough, nor
collapse one carrying a medium-or-higher finding to look clean.

## Step 4 — Follow up with the user (AskUserQuestion)

Never edit during the review. Immediately after the report, in the **same turn**,
**use the `AskUserQuestion` tool** to ask how to proceed — a concrete menu gets a
faster, cleaner decision than an open-ended "want me to apply these?". Offer the
choices that actually apply to this review, for example:

- **Apply the safe fixes** — local, mechanical, easy to eyeball: `openness` blank
  lines, `explaining-variable` locals, `magic-literal` constants, `role-name`
  renames, `guard-clause` inversions, verified-redundant `needless-cast`, trivial
  `over-complex` simplifications, and `dead-code` that is an unread binding or an
  always-true guard.
- **Walk the structural ones** — one at a time, since they move or remove code across
  boundaries and are riskier: `ordering` reordering, `composed-method` extraction,
  `style-mix` extract/move/split, `command-query` splits, `full-construction` /
  `leaky-collection` reshaping, the `patterns` refactors (`composition`,
  `polymorphism`, `execute-around`), large `over-complex` unifications,
  `test-structure` restructuring, and `dead-code` removal of a branch that looks
  reachable.
- **Include the boy-scout extras**, or skip them and touch only the changed code.
- **Report only** — change nothing.

Make the options match the findings you actually have (don't offer "walk the
structural ones" if there are none). Then apply with `Edit` only what the user
chose; auto-apply nothing structural without an explicit yes. Before each edit, Read
the file and locate the site by its **content** rather than the line number you
recorded. After any structural change, re-run the project's build/tests if it has
them — reordering and unification can break things a blank line cannot.

<review_tone>
Say in one sentence what you are about to do before the first tool call, then work.
Lead the wrap-up with the outcome: what the review found, then the detail. Match the
report to the findings; the skeleton is a ceiling, not a quota.
</review_tone>

<report_shape_reminder>
Your deliverable is the Step 3 skeleton, nothing else: a `**Conventions:**` line and a
`**Headline:**` line first, `###` headers that are **file paths** (never "Findings" or
"Finding 1"), one markdown bullet per finding in the
`` `family` · rule severity · L<lines> — loss → fix `` shape, then `Not flagged`, then
`Tally`. No fenced code blocks anywhere in the report: every fix is a clause naming a
symbol or a move. The tally ends the report, and the Step 4 `AskUserQuestion` follows it
in the same turn — never end the turn on the report.
</report_shape_reminder>
