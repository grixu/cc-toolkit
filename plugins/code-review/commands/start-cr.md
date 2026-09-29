---
description: >-
  Explicit-invocation orchestrator that runs the eight review lenses (comments,
  readability & tests, naming & module, objects & patterns, simplicity & types,
  security, performance, spec) in parallel over a change and merges them into one
  per-file report. Three lenses are gated by the input, never by the user: security
  is always on, performance runs only when executable source files are in scope,
  spec only when a spec file is named — by `--spec <path>`, or by the user accepting
  the one the diff itself carries. Manual only — never auto-triggered. It resolves
  scope once, dispatches one scanner subagent per active lens, re-grades severity
  centrally, and offers a single apply menu. It never edits code during the review.
allowed-tools: Read, Bash, Grep, Glob, Agent, AskUserQuestion, Edit, Write
argument-hint: "[paths...] [--base <branch>] [--spec <path>]"
---

# start-cr — one review, up to eight parallel lenses

You are the **Orchestrator**. You resolve scope **once**, resolve the **active lens
set** once, dispatch **one Scanner per active Lens** in parallel, merge their
findings, render **one** report grouped by file, and offer **one** apply menu. The
Scanners judge the code; you decide what survives. Editing happens only in Step 6,
and only for what the user picks.

This command is **explicit invocation only**; it is never auto-triggered. There
is no lens selection — which Lenses run is decided by the input in Step 2b, never by
user choice: the five craft Lenses and `security` always run, `performance` runs
when executable source is in scope, `spec` when a spec file is named. For a partial
review the user invokes `/comment-review` or `/quality-review` directly.

Arguments: `$ARGUMENTS`

## Step 1 — Resolve scope (once)

Parse the invocation arguments. Resolve the file list **exactly once here**; every
Scanner's `<files>` is cut from this one list in Step 2b, and all of them get the same
`diff_args`.

- **Arguments are file or directory paths** → review those targets in full.
  Expand directories to their source files. Skip the diff machinery below.
- **`--base <branch>`** → pass it straight through to the script as
  `--base <branch>`.
- **`--spec <path>`** → the spec the `spec` Lens reviews the change against. It works
  in path mode and in diff mode alike. When the value is a **readable local file**,
  Read it now and keep its path and full text for Step 2b and the `<spec>` brief
  slot. Anything else — a URL, a ticket id, a path that does not exist or cannot be
  read — is not a spec: tell the user what you received and ask for a local path,
  **never guess silently**, never fetch, never substitute a file you think they
  meant. Until a usable path arrives (or the user drops `--spec`) the `spec` Lens is
  inactive.
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

  - both zero → before concluding, look for an `alternate` object in the `committed`
    output: the script adds it when the resolved base saw nothing but another base
    (usually `origin/main`) holds real commits, which is what a freshly pushed branch
    tracking its own remote counterpart looks like. When it is there, say which base was
    used, which one differs and by how many files, and offer to re-run with
    `--base <alternate.ref>` — do not report "nothing to review" over it. With no
    `alternate`, tell the user there is nothing to review and **stop**;
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

**When the change carries its own spec, offer the Lens.** If `--spec` was not passed
and the resolved list contains a specification-shaped file — a path under `specs/`,
`spec/`, `docs/adr/`, `tasks/`, or a name matching `*SPEC*.md`, `*ADR*.md`, `*.spec.md`,
`*-plan.md` — say so in one line and offer that path with a single `AskUserQuestion`:
review the change against it, or continue without the `spec` Lens. Offer the one file
that best fits (the most recently changed, or the one the other files sit under); more
than two options is a menu, not an offer. On acceptance, treat it exactly as a passed
`--spec` — Read it now — and note in the Tally that the spec Lens was activated from the
diff rather than from the flag. Do not make this offer twice, and never activate the
Lens without the user saying yes.

**Which files get judged** — the in-scope extensions, the skip list, and the rule
about a skipped dependency manifest that is the substance of the change — is in
`${CLAUDE_PLUGIN_ROOT}/references/scope.md`. Read it and apply it to the resolved
list. Then classify every surviving file by that file's `## File kinds` section —
`source`, `test`, or `iac` — and record the kind beside each path: Step 2b gates the
`performance` Lens on the `source` subset, and the `comments` Scanner's test-file bar
(R11) keys off the same classification.

## Step 2 — Read project conventions and standards (once)

`${CLAUDE_PLUGIN_ROOT}/references/scope.md` also carries the **mechanical convention
read** (the exact paths, root first) and the **language-applicability** rules for
families or rules that have no counterpart in the language under review. That read
now opens with the **standards pair** at the repository root — `CODING_STANDARDS.md`,
then `CODING_STANDARDS.local.md` — which LAYER: both apply, and where two statements
conflict the `.local` one wins. Work it there, then:

- capture what you learned in one short **conventions note**, and **pass it to every
  Scanner** so a documented convention never surfaces as a finding; the note also
  records a **tracked `.local` file** (`git check-ignore` fails on it) and any
  **conflict between two project files** (resolved by scope.md's precedence order),
  both of which reach the report's `Conventions` line;
- **one note, byte-identical in every brief, and it may only suppress.** Write it once and paste
  the same text into all N briefs: a per-Lens note is a per-Lens instruction, and the Scanner
  reads whatever it finds there as what you want it to look for. So the slot holds nothing but
  documented conventions, each **quoted verbatim with its file** — never your own threat
  hypotheses or "where to focus", never an "established facts — do not raise" list, never a
  paraphrase of a rule (one run's paraphrase said a legacy pattern "is documented as accepted"
  where the rule said to migrate off it, and buried the very finding the user later asked for).
  Anything you want checked belongs in the Lens's own rules file, not here. A note that grows
  past a screen is the wrong shape: cut it to the rules that actually suppress something;
- name any family or rule the language makes **N/A** in that note, so its owning
  Scanner clears it in one line instead of inventing findings to fit;
- keep the standards text **out of the note**: it travels in the brief's own
  `<standards>` slot because, unlike everything else the read picks up, it
  **generates** findings. A Scanner raises `` `standards` · <slug> · <sev> `` only for
  an explicit, quotable rule inside its own Lens's subject, citing the file and
  section; vague prose ("write clean code") never generates; unsettled fit goes to
  `CANDIDATES`; a rule the `.local` file relaxes is suppressed; and a
  formatting/whitespace/import-order/quote rule is skipped when a formatter or linter
  config exists at the root (scope.md lists the presence check). When the pair is long,
  **pre-slice it per Lens** so each Scanner receives only the rules in its subject; a
  short pair goes to every Scanner whole. The rest of the conventions — `CLAUDE.md`,
  `AGENTS.md`, `CONTRIBUTING.md`, `.cursor/rules`, `.claude/rules` — stay
  **suppress-only**: they remove findings, never create them.

## Step 2b — Resolve the active lens set

Not every Lens runs on every change. Decide the set here, once, from the input —
never from a preference:

- the five craft Lenses (`comments`, `readability & tests`, `naming & module`,
  `objects & patterns`, `simplicity & types`) and **`security`** are **always
  active** — six on any change, however small;
- **`performance`** is active iff the `source`-kind subset of the resolved list,
  **minus `.sh` files**, is non-empty — a tests-only, IaC-only, or shell-only change
  skips it;
- **`spec`** is active iff a spec resolved to a readable local file in Step 1 — from
  `--spec`, or from the offer the user accepted when the change carried its own spec.

Record **N**, the number of active Lenses, and for each one its own `<files>`:
`performance` gets the source subset it was gated on; every other Lens gets the full
resolved list. Record every **inactive** Lens with its reason (`performance — no
executable code`, `spec — no spec named`); the Tally prints them in Step 5. From here on
**N** means this count: N Scanners dispatched, N `<result>` blocks awaited, N outputs
merged.

## Step 3 — Dispatch N Scanners in parallel

Emit all N Scanner calls — **one per active Lens** — with the `Agent` tool in a
**single message**. Batching them in one message is what makes them run concurrently,
and a concurrent fan-out **runs in the background**: N agents cannot each block and
return inline at once, so the harness backgrounds them — this holds **even if you pass
`run_in_background: false`**, because the flag cannot make a concurrent fan-out
synchronous. Let them background; that is the working path.

**Without the `Agent` tool there is no review to run.** In some contexts — inside another
agent, inside a workflow step — it is simply absent, and a single pass by one reader is not this
command however carefully it reads. Say so in your first sentence, name the lenses that will not
run, and let the caller decide between an announced single-pass reading and invoking
`/quality-review`, `/comment-review` and `/security-review` as their own agents. Never discover
this silently halfway and report the result as a review.

**Never pass `name:` to a Scanner call.** Naming routes the Scanner into the agent-teams
mailbox, where its findings come back only if you ask for them and it answers — a channel
that has failed outright in practice, leaving an orchestrator with every Scanner signalling
`{"type":"idle_notification","idleReason":"available"}` and no findings to merge, and that
costs a round trip per lens even when it does work. An **unnamed** agent needs no asking:
its full output arrives on its own in the `<result>` block of its `<task-notification>`.
You give up nothing by leaving them unnamed — there is nothing you need to say to a Scanner
once it has its brief.

**Collect from the `<task-notification>`.** Each Scanner's completion notification carries
its findings verbatim inside `<result>` — that is the delivery, and it arrives on its own:

1. **Wait for N `<result>` blocks — do not chase them.** An unnamed Scanner delivers
   unprompted, and `SendMessage` could not make you wait anyway: it returns an immediate
   routing receipt (`{"success":true,"message":"Message sent to …'s inbox"}`) and hands
   control straight back, so "ask and block on the reply" is not a thing the tool can do.
   Chasing a Scanner that is merely slow makes it regenerate its whole output, which can
   land after you have already merged.

   **Waiting is ending your turn.** Once the pre-reading below is done, say "standing by" and
   end the turn: each `<task-notification>` wakes you, and a turn you never end is the only way
   to *not* receive them promptly. Never `sleep`, never poll `ListAgents`, never `stat` a
   Scanner's transcript, never emit a placeholder tool call to stay alive, and never set up a
   `Monitor` or an `until` loop over any of these — a run that polled its way through the wait
   burned 70% of its turns and two thirds of its context on `echo ok`, and the leftover timers
   then fired into the report and the apply phase. And **never `TaskStop` a Scanner**: elapsed
   time is not a state you can observe, the "stalled" one was mid-`Read` with 27 tool calls
   behind it, and killing it cost the review its whole security lens.
2. **Fail closed on an empty `<result>`, not on silence.** The failure to catch is a
   notification whose `<result>` is missing, empty, or truncated mid-block — that Scanner
   has **not** reported. A `<result>` that presents itself as an **amendment, a correction, or
   a partial list** counts as truncated too, whatever it contains: the Scanner's own full
   findings are somewhere you cannot see, so re-dispatch that Lens rather than merge the
   fragment. Re-dispatch that one Lens as a fresh **unnamed** `Agent` and
   collect its `<task-notification>` the same way — this holds for every active Lens,
   `security`, `performance` and `spec` included. Never quietly review that lens yourself
   and pass the result off as a full N-lens review. If the re-dispatch also comes back empty,
   **tell the user that lens is unavailable** and ask whether to proceed without it or
   abort — those two are the whole menu, and "I read that lens inline myself" is not on it,
   however reasonable it looks as the recommended option. A single-pass or missing-lens review is a **labelled, user-acknowledged
   degradation**, never the silent default — that silent fallback is exactly how a single
   perspective's false positive reaches the report unchecked.
3. **Merge only once all N have delivered a `<result>`.** Merging early loses findings.

While the Scanners run, do work that doesn't depend on them — **pre-read the diff and the
changed files** so you can re-grade and locate sites the moment findings land. While you
have them open, run the **file-growth check**, which costs the Scanners nothing: compare
each changed file's line count before and after the change (`git diff --numstat
<diff_args> -- <path>` gives the lines added and removed; `wc -l` on the working copy
gives the head count). A file the change grows past **~1000 total lines** with no
decomposition in the same change gets its **own bullet in `Not flagged`** — a real
problem with no rule to land on, never compressed into the one-line list.

### The Scanner brief

The brief each Scanner receives, the eight Lenses and their output contracts, and the three
side-channels are in `${CLAUDE_PLUGIN_ROOT}/references/scanner-contract.md` — read it completely
before the dispatch and fill every slot of the brief it defines. Its paths are relative to
`${CLAUDE_PLUGIN_ROOT}/references/`: a brief carries the absolute
`${CLAUDE_PLUGIN_ROOT}/references/rules/<lens>.md` in its `<rules_file>` slot.

## Step 4 — Merge and re-grade

Merge the N outputs by the **Merge and re-grade** half of
`${CLAUDE_PLUGIN_ROOT}/references/merge-contract.md` — read it now if you have not. Every rule
there binds this step: dedup, convergence, routing every `HANDOFF` and candidate, the published
`Reconciliation` line, `(verify)` resolution, re-grading against the severity table, and judging
each fix before it can reach Step 6.

## Step 5 — Report (one per-file skeleton, two vocabularies side by side)

Render the review with **exactly** the skeleton in the **Report** half of
`${CLAUDE_PLUGIN_ROOT}/references/merge-contract.md`, and by every rule for filling it in that
follows the skeleton there — same structure between runs, nothing added.

**`Tally` ends the report text, not the turn.** Go straight into Step 6's
`AskUserQuestion` — same turn, no pause, nothing between it and the tally. A turn that
ends on the report leaves the run stalled with the findings unactionable until the user
prods it, and the report then costs a second render to get back on screen. The closure
cues in the skeleton's rules (`closes with Tally`, `the skeleton is the whole report`) bound
the report's *shape*; they do not license ending the turn.

## Step 6 — Apply menu (single AskUserQuestion, multiSelect; never edit during review)

Never edit during the review. Immediately after the report, in the **same turn**, use
**one** `AskUserQuestion` (`multiSelect: true`) with categories cut **by risk, not by
origin**. Only offer a category when you actually have findings that fall into it. **`AskUserQuestion`
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
  looks reachable; the cross-file `module` and `objects` rules (`dependency-direction`,
  `misplaced-logic`, `canonical-helper`, `pass-through`, `feature-envy`, `data-clump`,
  `message-chain`); every **`performance`** fix; every **`security`** fix; **plus**
  comment **MOVE**.
- **Boy-scout extras** — apply the untouched-code findings, or skip them. **Risk sorts this
  bucket too.** Only the mechanical ones — the same edits Safe fixes accepts — travel as a batch;
  a boy-scout finding whose fix moves, removes or restructures code, or touches `security`, joins
  the structural walk and is applied one at a time with its own yes. Untouched code is where the
  review understands the least, so a structural edit there is riskier than the same edit inside
  the diff, not safer: one run bundled a client split into this bucket, silently broke a
  double-submit guard, dragged an unrelated page into the pull request, and the user discarded
  the work.
- **Report only** — change nothing.

**Route any unlisted rule by the fix's risk, not its family:** a mechanical, eyeball-able
edit (a rename, a named constant, deleting an unread binding) → Safe fixes; anything that
moves or restructures code, or removes a branch that looks reachable → structural. A
`standards` finding is an unlisted rule and routes the same way.

**Security is never a Safe fix.** However small the edit looks — a bound parameter, a
removed literal — it changes behaviour at a boundary, so a `security` finding always
walks structurally, one at a time. When a canonical bucket is empty, `security` may take
the freed slot as its own option, **Security fixes (walk one at a time)**, so the user
can pick it apart from the craft restructuring. A `secret-in-source` fix removes the
literal from the file and nothing more: the wrap-up states that **rotating the exposed
secret is the user's step** — the review cannot do it and must not imply it did.

**`spec` findings are report-only.** A missing or partial requirement is work to do,
not an edit to apply, and never enters a bucket. The one exception is a
`wrong-implementation` the review **verified** in Step 4 whose fix is a **single edit**:
that one is offer-able through the escape hatch below for a confirmed correctness
problem.

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
  as its own apply bucket; so is a verified `spec` · wrong-implementation with a one-edit
  fix. The review's most valuable output belongs in the menu, not buried in `Report
  only` or `Boy-scout extras` because it lacks a rule tag. It is the **only** way a `Not
  flagged` item enters the menu: it gets its own option, named for the problem, never folded
  into `Safe fixes` or `Boy-scout extras` where the user approves it without seeing it.
- **When there are more candidates than slots**, the order is: a confirmed `security` problem
  first, then a verified correctness problem with no rule, then the canonical buckets by risk,
  and `Boy-scout extras` last — it is the one whose loss costs the change nothing. A run that
  gave its last slot to a boy-scout nit while a verified backend gap waited had the priority
  backwards.
- A before/after **preview** diff belongs in an `AskUserQuestion` option, never in the
  report body — Step 5 stays clause-only.

**Put the review on disk before the apply phase starts.** The apply walk is the longest stretch
of the run and the one most likely to be compacted; when that happens mid-walk, the report and
the user's answer are gone, and a run that had to reconstruct its approved list by parsing its
own transcript spent that effort for nothing. Write the rendered report to a file in the session
scratchpad before the menu, and the user's selection — each approved finding with its file, site
and exact fix — under it as soon as the answer arrives. Read it back rather than recalling it,
and say where it is in the wrap-up.

Apply with `Edit` only what the user selects; **auto-apply nothing structural
without an explicit yes**. Only findings confirmed in Step 4 enter an apply batch.

**`Edit` means the tool, not "an edit".** No `sed -i`, no Python or heredoc rewrite, no `awk`,
however convenient the shell looks for a repeated change: `Edit` fails loudly when the text it
expects is not there, and a shell rewrite silently hits every look-alike in the file — one run's
blanket strip took out the project's own documented comment prefix, which its conventions note
had just said to leave alone. A formatter runs on the files you edited, never across the package
or the repository: three runs reflowed snapshots, fixtures and a protected `tsconfig` that way,
then had to revert them and explain them to the user as "not mine".

**An approved fix that cannot be applied as approved goes back to the user.** A hook blocks it,
the site turns out ambiguous, the edit needs a companion change nobody approved — say which fix,
what stopped it, and what you would do instead; never substitute a different edit (one run
deleted a test where the approved fix was to fold it into another) and mention it in passing
afterwards. The wrap-up lists every approved fix that was skipped, substituted or extended, with
its reason, and claims nothing the tree does not carry.

**`Write` creates a file that does not exist yet, and nothing else.** Two cases: a new file
the user picked from the menu — the missing spec a correctness bucket offered, say — and the
review's own scratchpad file above, which lives outside the repository. Every change to a file already on disk goes through `Edit`, so a
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
what each editor applied or skipped into the wrap-up, and when a `secret-in-source`
fix landed, say plainly that the secret still needs rotating and that is the user's
step.

<review_tone>
Say in one sentence what you are about to do before the first tool call. While the
Scanners run, speak up only when you find something important or change direction —
not once per lens. Lead the wrap-up with the outcome: what the review found, then the
detail. Match the report to the findings; the skeleton is a ceiling, not a quota.
</review_tone>

<report_shape_reminder>
The review you render is the Step 5 skeleton, nothing else: a `**Conventions:**` line
and a `**Headline:**` line first, `###` headers that are **file paths** (never
"Findings" or "Finding 1"; the spec's own path is one, when `--spec` was given), one
markdown bullet per finding or verdict, then
`Not flagged`, `Boy-scout`, and `Tally`. No fenced code blocks anywhere in the report:
every fix is a clause naming a symbol or a move. The tally ends the report, and the
Step 6 `AskUserQuestion` follows it in the same turn — never end the turn on the report.
</report_shape_reminder>
