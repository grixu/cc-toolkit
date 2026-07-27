---
description: >-
  Explicit-invocation orchestrator that runs all five review lenses (comments,
  readability & tests, naming & module, objects & patterns, simplicity & types)
  in parallel over a change and merges them into one per-file report. Manual only
  — never auto-triggered. It resolves scope once, dispatches five scanner
  subagents, re-grades severity centrally, and offers a single apply menu. It
  never edits code during the review.
allowed-tools: Read, Bash, Grep, Glob, Agent, AskUserQuestion, Edit, Write
argument-hint: "[paths...] [--base <branch>]"
---

# start-cr — one review, five parallel lenses

You are the **Orchestrator**. You resolve scope **once**, dispatch **five
Scanners** (one per Lens) in parallel, merge their findings, render **one**
report grouped by file, and offer **one** apply menu. The Scanners judge the code;
you decide what survives. Editing happens only in Step 6, and only for what the
user picks.

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

  The detection calls above already returned the full file list for `uncommitted` and
  for `committed`, so **reuse that list** when the chosen scope is one of them — re-run
  the script with the chosen `--scope` only for **Both**, the one you didn't compute
  above. Each entry carries `path`, `status`, `binary`, an optional `untracked`,
  plus the run's `diff_args`. To see a file's change:

  - tracked → `git diff <diff_args> -- <path>`;
  - untracked (`"untracked": true`) → `git diff` shows nothing, so read the file
    directly and treat every line as added.

  Base resolution lives in the script, which computes the fork point internally
  via a subprocess `git` call — so there is no `git merge-base` for you to run
  here. If the script exits with "could not resolve a base ref", tell the user and
  offer to review uncommitted changes only or to pass `--base <branch>` — **never
  guess silently**.

**Which files get judged** — the in-scope extensions, the skip list, and the rule
about a skipped dependency manifest that is the substance of the change — is in
`${CLAUDE_PLUGIN_ROOT}/references/scope.md`. Read it and apply it to the resolved
list.

## Step 2 — Read project conventions (once)

`${CLAUDE_PLUGIN_ROOT}/references/scope.md` also carries the **mechanical convention
read** (the exact paths, root first) and the **language-applicability** rules for
families that have no counterpart in the language under review. Work it there, then:

- capture what you learned in one short **conventions note**, and **pass it to every
  Scanner** so a documented convention never surfaces as a finding;
- name any family the language makes **N/A** in that note, so its owning Scanner
  clears it in one line instead of inventing findings to fit.

## Step 3 — Dispatch five Scanners in parallel

Emit all five Scanner calls — **one per Lens** — with the `Agent` tool in a **single
message**. Batching them in one message is what makes them run concurrently, and a
concurrent fan-out **runs in the background**: five agents cannot each block and return
inline at once, so the harness backgrounds them — this holds **even if you pass
`run_in_background: false`**, because the flag cannot make a concurrent fan-out
synchronous. Let them background; that is the working path.

**Never pass `name:` to a Scanner call.** Naming routes the Scanner into the agent-teams
mailbox, where its findings come back only if you ask for them and it answers — a channel
that has failed outright in practice, leaving an orchestrator with five Scanners signalling
`{"type":"idle_notification","idleReason":"available"}` and no findings to merge, and that
costs a round trip per lens even when it does work. An **unnamed** agent needs no asking:
its full output arrives on its own in the `<result>` block of its `<task-notification>`.
You give up nothing by leaving them unnamed — there is nothing you need to say to a Scanner
once it has its brief.

**Collect from the `<task-notification>`.** Each Scanner's completion notification carries
its findings verbatim inside `<result>` — that is the delivery, and it arrives on its own:

1. **Wait for five `<result>` blocks — do not chase them.** An unnamed Scanner delivers
   unprompted, and `SendMessage` could not make you wait anyway: it returns an immediate
   routing receipt (`{"success":true,"message":"Message sent to …'s inbox"}`) and hands
   control straight back, so "ask and block on the reply" is not a thing the tool can do.
   Chasing a Scanner that is merely slow makes it regenerate its whole output, which can
   land after you have already merged.
2. **Fail closed on an empty `<result>`, not on silence.** The failure to catch is a
   notification whose `<result>` is missing, empty, or truncated mid-block — that Scanner
   has **not** reported. Re-dispatch that one Lens as a fresh **unnamed** `Agent` and
   collect its `<task-notification>` the same way. Never quietly review that lens yourself
   and pass the result off as a five-lens review. If the re-dispatch also comes back empty,
   **tell the user that lens is unavailable** and ask whether to proceed without it or
   abort. A single-pass or missing-lens review is a **labelled, user-acknowledged
   degradation**, never the silent default — that silent fallback is exactly how a single
   perspective's false positive reaches the report unchecked.
3. **Merge only once all five have delivered a `<result>`.** Merging early loses findings.

While the Scanners run, do work that doesn't depend on them — **pre-read the diff and the
changed files** so you can re-grade and locate sites the moment findings land.

### The Scanner brief

Send each Scanner a brief in this shape, filling every slot:

```
<scanner_brief>
  <lens>comments | readability & tests | naming & module | objects & patterns | simplicity & types</lens>
  <rules_file>${CLAUDE_PLUGIN_ROOT}/references/rules/<lens>.md</rules_file>
  <files><!-- the resolved in-scope paths from Step 1 --></files>
  <diff_args><!-- from Step 1 --></diff_args>
  <how_to_view>
    tracked → `git diff <diff_args> -- <path>`
    untracked → read the file directly; every line is added
  </how_to_view>
  <conventions><!-- the Step 2 note, including any N/A families --></conventions>
  <scope_split>
    primary = the problem is in code this change added or modified, or structure
    the change introduced or made worse.
    boy-scout = a problem in untouched code noticed only while reading for context —
    optional, kept strictly separate, never mixed into the primary findings.
    A fully added file (status `A`) has no boy-scout findings: the whole file is code
    the change introduced, so every finding in it is primary.
  </scope_split>
  <output_contract><!-- the contract for this Lens, below --></output_contract>
</scanner_brief>
```

Read the rules file **completely first**, then judge only the families that belong to
that Lens. A Scanner **returns findings/verdicts only**: it does not render a report,
does not re-grade centrally, and **writes nothing into the tree** — not the files under
review, and not a scratch or probe file to test a hypothesis against. It is reading the
user's working copy, so it settles a doubt by reading the type, the signature, or the call
site, and marks the rest `(verify)`. Read the whole changed file for context, and target
what the change touched.

### The five Lenses

1. **comments** → `${CLAUDE_PLUGIN_ROOT}/references/rules/comments.md`
   Returns per-comment **VERDICTS**, one per comment:
   `` `comments` · R# · KEEP/REMOVE/REWRITE/MOVE/ADD · `path:line` · "verbatim comment" — one-line reason → concrete suggested fix ``.
   Run the deletion test on every comment first. Surface **R9
   (contradicts-the-code) findings first**. The **test-file bar is higher (R11)**:
   default to REMOVE when unsure in tests. **`ADD` is the one verdict with no
   existing comment to quote** — an R2 *missing WHY* at genuinely non-obvious code
   (a magic constant, a workaround, a specific timeout/retry/batch size, a silent
   catch); it drops the verbatim-comment slot for a site description:
   `` `comments` · R2 · ADD · `path:line` — <what is non-obvious> → <the exact comment to add> ``.
   Raise `ADD` only where you can state the reason concretely — never a guess
   dressed as a WHY. Every suggested fix obeys the comment rules itself: no spec-id
   fragments (`(R2)`, `F1:`, `§4.1`), no new file/doc cross-references (R4), no
   banners (R5). For MOVE, name the destination and give the exact text to place
   there, plus "delete from the declaration".

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
of the three still uses the full vocabulary. Tell each Scanner that **severity is a
first pass** — you re-grade every quality finding centrally in Step 4, so it grades
honestly against its rules without agonizing over the boundary.

**The FINDINGS section holds findings only.** Anything a Scanner checked and cleared
belongs in one prose line, never in the finding shape — a "none found" or "is **not**
a finding" bullet with a dash where the severity goes reads as a finding to everything
downstream.

**A duplication finding sweeps the whole file.** "Target what the change touched" holds
for most rules, but duplication is the exception: when you flag repeated code (an
`over-complex` duplication, a copy-pasted predicate), scan the **rest of the file** for
every other copy of the same pattern and list all the call sites in the one finding —
including copies in code the change didn't touch. A finding that names two of three
copies makes the extraction fix leave a straggler behind.

### Three side-channels, three distinct meanings

Report what you find and let the merge filter it. Each Scanner judges against its
rules, then against each rule's own calibration paragraph — the look-alike that is
*not* a violation. Calibration clearing a site makes it a non-finding. Anything left
unsettled travels in one of three channels, and these are **not** interchangeable:

| channel | means |
|---------|-------|
| `(verify)` | the **fact** is unconfirmable here — runtime behaviour, or a file outside the review scope |
| `HANDOFF` | confirmed, but **another Lens's family** owns it |
| `CANDIDATES` | confirmed and mine, but the **rule fit or its calibration** is a judgment call |

- **`(verify)` marker** — a Scanner that doubts a finding **resolves it itself first**:
  it has `Read`, so it opens the type, the signature, or the call site and confirms or
  drops it (a `needless-cast` is the common case — check what the value's type actually
  is before claiming the cast is redundant). It appends `(verify)` only when confirming
  would take something it does not have. You resolve those in Step 4.
- **`CANDIDATES` block** — a site that survives the deletion of doubt about the *facts*
  but that the Scanner cannot settle against the rule's calibration. It belongs here
  rather than in the bin: you decide it with the whole review in view, and a candidate
  you reject costs one line in `Not flagged`, while one the Scanner never reported costs
  the finding outright.

  ```
  ## CANDIDATES (rule fit or calibration uncertain — orchestrator decides)
  - `family` · rule · `path:line` — <what I saw> → <which calibration I could not settle>
  ```

- **`HANDOFF` block** — a real problem that belongs to another Lens's family, in a
  separate block at the end of the output, never mixed into the Scanner's own findings
  and never buried in prose:

  ```
  ## HANDOFF (out-of-my-family — noticed but not mine to grade)
  - `<suggested-family>` · <rule if known> · `path:line` — <what the reader loses> → <why it isn't my family>
  ```

One terse line each. Omit a block when it is empty.

## Step 4 — Merge and re-grade

- **Collect** all five Scanners' outputs — every lens's `<result>` actually in hand per
  Step 3, not merely a notification that fired; a lens you could not collect is a labelled
  degradation you already surfaced to the user, never a silent gap in the merge.
- **Dedup overlaps**: when two findings point at the same code — including across
  different lenses — keep the **most-specific** one and drop the rest. When the overlap
  spans two severities (a `high` symptom folding into a lower-severity root cause, or the
  reverse), the surviving bullet keeps the **highest** severity of the overlap — deduping
  must never quietly demote a `high` under a `medium`.
- **Count the lenses that converged.** Independent Scanners landing on the same code
  is the strongest signal this review produces — they read the file separately and had
  no way to coordinate. Treat a finding several lenses reached (directly or via
  `HANDOFF`) as **confirmed**: it leads its file, and it is a candidate for the
  headline. Convergence raises confidence and ordering, **never severity** — that stays
  verbatim from the table.
- **Route every `HANDOFF` and every `CANDIDATES` entry to a visible home.** Assign a
  `HANDOFF` its correct family and rule; decide a candidate against its rule's
  calibration. Either way it lands in exactly one of two places: a graded bullet in the
  per-file report (on its own, or merged into a converging finding), or a `Not flagged`
  line with its one-line reason. **The entry no primary finding corroborates is the one
  that slips, so reconcile by an itemized check, not by assertion.** Before rendering,
  write the check out: enumerate every `HANDOFF` and every candidate you received, and
  against each name its home — the report bullet (`path:line`) it became, the converging
  finding it merged into, or the `Not flagged` line that clears it. An entry with no home
  on that list is a bug: route it before you render.
- **Publish that check as one counted line above the report** — `Reconciliation: N
  handoffs + M candidates → A merged · B own bullet · C boy-scout · D Not flagged` —
  where `A + B + C + D` equals `N + M`. The arithmetic is what makes the check real: a
  run that states "every handoff routed" without it has asserted rather than reconciled,
  and loses the entry nothing else corroborates. When the sums disagree, an entry is
  unrouted — find it, never adjust a number to close the gap.
- **Resolve every `(verify)` finding**: read the code and confirm or refute it. A
  confirmed finding drops the marker and proceeds; a refuted one is a **Scanner false
  positive** — drop it and note it under `Not flagged`. An unresolved `(verify)` finding
  never reaches an apply batch. Most runs will have none — the Scanners resolve their own
  doubts. When no Scanner emitted one, say nothing about `(verify)` anywhere: do not
  claim to have resolved an empty list, and do not relabel some other mechanism as a
  `(verify)` — a routed `HANDOFF`, a decided candidate, or a refuted scanner doubt is
  resolved under its own name.
- **Re-grade every quality finding's severity yourself** against the master table in
  `${CLAUDE_PLUGIN_ROOT}/references/severity.md` — read it now if you have not. It
  carries the 22 rows, what each severity means, and the anti-anchoring rule. A
  single-lens Scanner is the one most prone to the anchoring that table forbids, so its
  severity is a first pass and yours is the one that ships.
- **Comment verdicts are not re-graded** and are **not** mapped to severities. The
  two vocabularies stay side by side; there is no severity↔verdict mapping
  anywhere in this command.

## Step 5 — Report (one per-file skeleton, two vocabularies side by side)

Group by **file**, not by Scanner. Under each file, list quality findings and
comment verdicts **together**. Render with **exactly this template**, in this
order — keep the structure identical between runs:

```markdown
Reconciliation: <N> handoffs + <M> candidates → <A> merged · <B> own bullet · <C> boy-scout · <D> Not flagged

## Code review — <scope>

**Conventions:** <one line on what Step 2 picked up, or "none that change the verdict">
**Headline:** <one line — the single best or worst thing about the change>

### <path/to/file>
- `family` · rule severity · L<lines> — <what the reader loses> → <the fix, as a clause>
- `comments` · R# · KEEP/REMOVE/REWRITE/MOVE/ADD · L<line> — <reason> → <fix>

### <path/to/another/file>
- `family` · rule severity · L<lines> — <…>

**Not flagged:** <look-alikes deliberately passed on — one compact line, or a bullet
each when one is a real problem with no rule to land on; omit when empty>

**Boy-scout (untouched code, optional):**
- `family` · rule · <path>:L<lines> — <one line>

**Tally:** N quality findings (H high · M medium · K nit) · C comments (X remove · Y rewrite · Z move · V add · W keep) · F files. Skipped: <files + reason>.
```

A filled-in report reads like this:

<example>
Reconciliation: 4 handoffs + 2 candidates → 3 merged · 1 own bullet · 0 boy-scout · 2 Not flagged

## Code review — committed (base → HEAD), 3 files

**Conventions:** repo `CLAUDE.md` documents barrel exports as the public-API style, so `module` · barrel is not flagged here.
**Headline:** `checkout/total.ts` carries the tier-discount branch in three places that can drift apart independently.

### src/checkout/total.ts
- `simplicity` · over-complex high · L18, L34, L51 — three copies of the tier-discount branch drift independently → collapse into `discountFor(tier)` and call it at each site
- `readability` · magic-literal medium · L22 — `0.1` carries the gold-tier rate with nothing naming it → name `GOLD_DISCOUNT_RATE`
- `comments` · R1 · REMOVE · L17 — "// multiply by the rate" restates the line beneath it → delete these lines

### src/checkout/receipt.ts
- `naming` · role-name nit · L9 — `receiptArray` names the type instead of the role → `receipts`
- `comments` · R2 · ADD · L44 — the 250 ms retry gap is a gateway constraint no reader can infer → "// 250 ms — the gateway rejects retries closer than its own debounce window"

**Not flagged:** `JSON.parse(raw) as Config` at L7 (boundary narrowing, not `needless-cast`); the exhaustive `default:` throw at L61 (defensive assertion, not `dead-code`).

**Tally:** 3 quality findings (1 high · 1 medium · 1 nit) · 8 comments (1 remove · 0 rewrite · 0 move · 1 add · 6 keep) · 3 files. Skipped: pnpm-lock.yaml (lockfile).
</example>

**The skeleton is the whole report.** It has no other sections: no `### Findings`
header, no numbered or bolded finding entries, no `---` rules between findings, no
per-finding code block, no closing summary. The `###` headers are **file paths** — one
per reviewed file — and each finding is a single markdown bullet beneath its file. Do
not paste the code under review, the rewritten body, or a before/after block: a finding
that seems to need a code block is one whose fix is not yet stated as a clause, so state
it as a clause. Every report opens with `Conventions` and `Headline`, and closes with
`Tally`. The `Reconciliation` line is the only thing that precedes `## Code review` — it
belongs to Step 4's check rather than to the report, which is why it carries counts and
not prose.

Rules for filling it in:

- **Two vocabularies, side by side.** Quality findings use `` `family` · rule ·
  severity ``, with the family **backticked** — one of the seven fixed labels
  `readability`, `tests`, `naming`, `module`, `objects`, `patterns`, `simplicity` —
  and rule and severity verbatim from `references/severity.md`. Comment verdicts use
  `` `comments` · R# · KEEP/REMOVE/REWRITE/MOVE/ADD ``. **No severity↔verdict
  mapping** — keep them distinct.
- **Findings are markdown bullets** under a `###` file header (not inside a ```
  fence) so every `path:line` stays clickable.
- **Order files** by their highest-severity quality finding; a REMOVE/REWRITE/MOVE/ADD
  comment weighs like a medium for ordering. Within a file: high → medium → nit,
  then by line; put any **R9 (contradicts-the-code)** comment verdict first.
- **Collapse repeats**: one `family` · rule breaking in several spots is a single
  bullet with the lines listed together (`L20, L34, L51`).
- **The fix is a clause, not code.** "extract
  `transitionOrReportConflict(...)` and early-return at each site", "drop the `as
  User` cast", "name `SECONDS_PER_DAY`". Keep a rewritten body or a before/after
  block out of the report. For a comment REWRITE the fix is the exact replacement
  text; for MOVE, name the destination.
- **Quote comments verbatim.** Every comment verdict carries the verbatim comment
  text and its `path:line`.
- **`Not flagged`** lists the look-alikes deliberately passed on, plus every candidate
  and `HANDOFF` the merge cleared — one line when they are all genuine non-findings, a
  short bullet each when one of them is a *real* problem that merely has no rule to land
  on. A real problem keeps its own bullet rather than being compressed into a
  subordinate clause; that compression is how something worth acting on disappears. Drop
  the block if empty.
- **`Boy-scout`** holds only findings in code the change did not touch; omit the
  whole block when there are none.
- **Resolved findings only.** The body lists confirmed findings; a refuted one goes in
  `Not flagged` as a Scanner false positive.
- **The headline may not contradict the combined tally.** If there is any quality
  `high` or `medium` finding, **or** any comment REMOVE / REWRITE / MOVE / ADD, the
  headline names the worst one — it must not call the change "clean",
  "well-structured", or "only cosmetic nits". Reserve the clean verdict for a tally
  that is genuinely nits-only-and-all-KEEP (or empty).

Collapse the whole report to the title line plus a one-sentence verdict and the
tally **only when the change reads cleanly** — the quality tally is empty or
nits-only and every comment is KEEP. Match the report to what you found: neither pad
a clean one to look thorough, nor collapse one carrying a medium-or-higher finding or
a REMOVE/REWRITE/MOVE/ADD to look clean.

## Step 6 — Apply menu (single AskUserQuestion, multiSelect; never edit during review)

Never edit during the review. After the report, use **one** `AskUserQuestion`
(`multiSelect: true`) with categories cut **by risk, not by origin**. Only offer a
category when you actually have findings that fall into it. **`AskUserQuestion`
accepts at most four options** — the four canonical risk buckets below are the whole
menu; never add a fifth. `Report only` is always offered:

- **Safe fixes** — mechanical, easy to eyeball: quality `openness`,
  `explaining-variable`, `magic-literal`, `role-name`, `guard-clause`,
  verified-redundant `needless-cast`, trivial `over-complex`, and `dead-code` that is an
  unread binding or an always-true/false guard; **plus** comment
  **REMOVE** and **REWRITE**, and a comment **ADD** whose rationale the review
  actually confirmed — locate the code site by content and insert the comment
  above it. An `ADD` whose WHY you could only guess is **report-only**: hand the
  author the suggested text, since only they know the real reason.
- **Walk the structural ones (one at a time)** — riskier, they move or remove code:
  `ordering`, `composed-method` extraction, `command-query` splits, `style-mix` /
  `full-construction` / `leaky-collection` reshaping, the `patterns` refactors
  (`composition`, `polymorphism`, `execute-around`), large `over-complex`
  unifications, `test-structure` restructuring, and `dead-code` removal of a branch that
  looks reachable; **plus** comment **MOVE**.
- **Boy-scout extras** — apply the untouched-code findings, or skip them.
- **Report only** — change nothing.

**Route any unlisted rule by the fix's risk, not its family:** a mechanical, eyeball-able
edit (a rename, a named constant, deleting an unread binding) → Safe fixes; anything that
moves or restructures code, or removes a branch that looks reachable → structural.

**Degenerate and edge menus.** The four buckets are a ceiling, not a quota, and the menu
must stay honest when findings don't spread across them:

- **One bucket only** (every finding is Safe, say) → offer that bucket + `Report only`; a
  single-select `AskUserQuestion` is fine here. An "apply everything" option that is a
  **superset** of narrower ones is not offer-able — `multiSelect` options must be
  **disjoint**. You *may* split one bucket into disjoint sub-options by what they touch
  ("comment rewrites" vs "the one nit") when that hands the user a real, non-overlapping
  choice.
- **A freed slot** — when a canonical bucket is empty (no boy-scout, no structural), you
  may split a populated bucket into two risk-ranked disjoint options in the freed slot,
  still never exceeding four options total.
- **A confirmed correctness problem no rule cleanly names** — the kind that lands in
  `Not flagged` or spans untouched code, yet the review actually verified — is offer-able
  as its own apply bucket. The review's most valuable output belongs in the menu, not
  buried in `Report only` or `Boy-scout extras` because it lacks a rule tag.
- A before/after **preview** diff belongs in an `AskUserQuestion` option, never in the
  report body — Step 5 stays clause-only.

Apply with `Edit` only what the user selects; **auto-apply nothing structural
without an explicit yes**. Only findings confirmed in Step 4 enter an apply batch.

**`Write` creates a file that does not exist yet, and nothing else.** The one case is
a new file the user picked from the menu — the missing spec a correctness bucket
offered, say. Every change to a file already on disk goes through `Edit`, so a
targeted fix can never turn into a wholesale rewrite of a file the review only read
in part. This is the Orchestrator's alone: a Scanner still writes nothing at all.

**Scanner line numbers are estimates, not ground truth.** A finding's `path:line`
is where the Scanner *thought* the code sat; before each edit, Read the file and
locate the exact site by its **content**. If the code or comment a finding describes
is not actually there, it is a **Scanner false positive** — skip it and note it in the
wrap-up. Never edit a nearby line to force the match.

**Before writing any comment-fix `Edit`, scrub the replacement text** for leftover
spec-id fragments (`(R2)`, `F1:`, `§4.1`, a file path) and strip them — the whole point
of the fix is that the citation does not survive into the file. For a confirmed comment
**MOVE**, apply the deletion at the declaration and insert the rewritten comment at the
destination **only when a single unambiguous site was located**; if the destination was
ambiguous, apply just the deletion and hand the user the exact text to paste.

**Split the safe batch across editor subagents by what you have already read.** An
editor pays a full file read before its first `Edit`, so fanning out a file you
already hold in context buys nothing and costs that read twice. Count the safe-batch
files you have **not** read in this session: **four or more → fan out** (those files
only); **three or fewer → apply the whole batch inline**. Files you already read in
Step 4 stay with you either way. If one editor can finish the batch, use one rather
than several, and keep the group count low.

When you do fan out, partition those files into a handful of balanced groups and
dispatch one `Agent` editor per group **in a single message** and, as with the Scanners,
**unnamed** — a batched fan-out backgrounds whatever you pass for `run_in_background`, and
each editor's per-file applied/skipped summary comes back in the `<result>` block of its
`<task-notification>`. Naming one puts its summary behind the same unreliable mailbox pull
as a Scanner's findings. Ownership is **disjoint by file**: never let two editors touch the
same file (concurrent `Edit`s to one file race). Each editor receives its file subset, the
exact approved fix for every site in those files, the Step 2 conventions note, and these
invariants — locate each site by content before editing, scrub every replacement, apply
nothing beyond the listed fixes, and **do not run build/tests** (you run them once, after). Each returns what it
applied per file and what it skipped, with the reason. Run the editors to completion
first, then walk the structural fixes.

**Walk the structural fixes yourself, one at a time — never fan these out.** They
move code, must be sequenced, and are verified by build/tests, so they stay under
your control even when the safe batch is parallelized.

Once every edit has landed — inline, from the editor subagents, and from the
structural walk — re-run the project's build/tests if it has them, **once**:
reordering and unification can break things a blank line cannot. Then aggregate
what each editor applied or skipped into the wrap-up.

<review_tone>
Say in one sentence what you are about to do before the first tool call. While the
Scanners run, speak up only when you find something important or change direction —
not once per lens. Lead the wrap-up with the outcome: what the review found, then the
detail. Match the report to the findings; the skeleton is a ceiling, not a quota.
</review_tone>

<report_shape_reminder>
The review you render is the Step 5 skeleton, nothing else: a `**Conventions:**` line
and a `**Headline:**` line first, `###` headers that are **file paths** (never
"Findings" or "Finding 1"), one markdown bullet per finding or verdict, then
`Not flagged`, `Boy-scout`, and `Tally`. No fenced code blocks anywhere in the report:
every fix is a clause naming a symbol or a move.
</report_shape_reminder>
