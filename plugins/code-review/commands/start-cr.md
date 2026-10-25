---
description: >-
  Explicit-invocation orchestrator that runs the nine review lenses (comments,
  readability & tests, naming & module, objects & patterns, simplicity & types,
  correctness, security, performance, spec) in parallel over a change and merges them
  into one per-file report. Lenses are gated by the input, never by the user:
  correctness and security are always on, performance runs only when executable source files are in scope,
  spec only when a spec file is named — by `--spec <path>`, or by the user accepting
  the one the diff itself carries. Manual only — never auto-triggered. It resolves
  scope once, dispatches one scanner subagent per active lens, re-grades severity
  centrally, and offers a single apply menu. It never edits code during the review.
  With `--pr <number>` it reviews a GitHub pull request's head against its base; on
  someone else's pull request it drafts review comments instead of applying fixes. Without
  `--pr`, on a branch that is someone else's open pull request, it offers that reviewer mode.
allowed-tools: Read, Bash, Grep, Glob, Agent, AskUserQuestion, Edit, Write
argument-hint: "[paths...] [--base <branch>] [--spec <path>] [--pr <number>]"
---

# start-cr — one review, up to nine parallel lenses

You are the **Orchestrator**. You resolve scope **once**, resolve the **active lens
set** once, dispatch **one Scanner per active Lens** in parallel, merge their
findings, render **one** report grouped by file, and offer **one** apply menu. The
Scanners judge the code; you decide what survives. Editing happens only in Step 6,
and only for what the user picks.

This command is **explicit invocation only**; it is never auto-triggered. There
is no lens selection — which Lenses run is decided by the input in Step 2b, never by
user choice: the five craft Lenses, `correctness` and `security` always run (`objects & patterns`
except over infrastructure code alone), `performance` runs
when executable source is in scope, `spec` when a spec file is named. For a partial
review the user invokes `/code-review:comment-review` or `/code-review:quality-review` directly.

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
  Read it now and keep its path for Step 2b and the context directory's `spec`. Anything else — a URL, a ticket id, a path that does not exist or cannot be
  read — is not a spec: tell the user what you received and ask for a local path,
  **never guess silently**, never fetch, never substitute a file you think they
  meant. Until a usable path arrives (or the user drops `--spec`) the `spec` Lens is
  inactive.
- **`--pr <number>`** → review a GitHub pull request: its head's commits against its
  base, the way its reviewers see it. It needs `gh`; without it, or when `gh pr view`
  fails, say why and stop — never fall back to the local branch as if it were the PR.
  `--pr` takes no paths and no `--base` (the PR defines both); `--spec` still works.

  ```bash
  gh pr view <number> --json number,title,url,state,author,baseRefName,headRefName,headRefOid,headRepository,headRepositoryOwner,isCrossRepository,maintainerCanModify
  gh api user --jq .login
  git fetch origin <baseRefName>
  git fetch origin pull/<number>/head
  ```

  When the checkout's `HEAD` is already `headRefOid`, review here. Otherwise add a
  detached worktree for it — `git worktree add --detach <repo>.worktrees/cr-pr-<number>
  <headRefOid>` — and run everything in it: the script with `-C <that path>`, every
  `git diff`, every Scanner's `<how_to_view>`, and every edit of the apply phase. The
  user's checkout is never switched, stashed or touched. Then resolve the list once:

  ```bash
  python3 ${CLAUDE_PLUGIN_ROOT}/scripts/get_changes.py -C <checkout> --scope committed --base origin/<baseRefName>
  ```

  A `count` of zero on an open PR means the fetch or the base is wrong, not that the PR
  is clean: say which and stop. Name the PR (number, title, `head → base`) in the
  report's scope line.

  When `author.login` differs from the login `gh api user` returned, the PR is someone
  else's and the run is in **reviewer mode** (see the section after Step 7): say so in one
  line now. The author decides what lands on their branch, so the review drafts comments
  for them instead of editing anything.
- **No path arguments and no `--pr`** → first ask `gh` whether the current branch is someone
  else's open pull request, run in the checkout:

  ```bash
  gh pr view --json number,title,state,author
  gh api user --jq .login
  ```

  When `gh` is missing or either call fails (no pull request for the branch, no GitHub remote),
  when `state` is not `OPEN`, or when `author.login` is the `gh` user, carry on below without a
  word. Otherwise the user may be reviewing a colleague's branch they checked out, and an apply
  menu would edit work that is not theirs, so ask with **one** `AskUserQuestion` before anything
  else: **Review PR #<number> as its reviewer (Recommended)** — draft comments for
  `<author.login>`, edit nothing — first, then **Review the local changes** — the branch diff
  with the apply menu, as without a pull request. On the first answer, continue exactly as
  `--pr <number>` above (a `--base` the user passed gives way to the PR's base); on the second,
  carry on below. Never enter reviewer mode without that answer.

  Then review the current branch diff. Detect what exists with
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
  - both non-zero, but every file on one side is one `${CLAUDE_PLUGIN_ROOT}/references/scope.md`
    **skips** (Markdown, JSON, plain text, a lockfile…) → use the other side without
    asking: a question whose one answer grades nothing only holds the review up. Say which side
    you review in one line, and name the other side's files once in the report, in the `Tally`'s
    `Skipped:` clause (`CLAUDE.md, docs/notes.md (uncommitted, skipped kinds)`), and in the
    context directory's `skipped`. This does not hold when a spec is active — `--spec` resolved
    to a readable file, or that side holds a document the spec offer below would make: the `spec`
    Lens reviews every skipped file, so every answer grades something. Ask as below;
  - both non-zero, with a file on each side that the review would judge → ask with **one**
    `AskUserQuestion` which to review — **Uncommitted** (working tree vs HEAD), **Committed**
    (HEAD vs base), or **Both** (base → working tree) — putting the file counts you just saw in
    each option's description.

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
and the resolved list contains a specification-shaped document — a Markdown file
(`.md`, `.mdx`) under `specs/`, `spec/`, `docs/adr/`, `tasks/`, or named `*SPEC*.md`,
`*ADR*.md`, `*.spec.md`, `*-plan.md`; a code file under `spec/` is a test, never a spec —
say so in one line and offer that path with a single `AskUserQuestion`: review the change
against it, or continue without the `spec` Lens. Offer the one file that best fits: a
spec (`*SPEC*.md`, `specs/`) over an ADR or a plan when both are there — an ADR records
one decision, a spec states what the change must do — then the one the other files sit
under, then the most recently changed. More than two options is a menu, not an offer.
When the diff carries none, look once at the base too: a spec usually lands before its
implementation, so `git ls-files '*SPEC*.md' 'specs/**/*.md'` and offer the one whose
directory or name matches the branch name's last segment, when exactly one does. When neither
finds one, look once in the primary worktree — the first `worktree` entry of
`git worktree list --porcelain`, where a spec workflow often leaves its files untracked or on a
sibling branch: among its `SPEC.split.md` and `tasks/*.md` files, tracked or not
(`git -C <primary> ls-files --cached --others --exclude-standard`), find the ones that name the
current branch (`git branch --show-current`) and offer the `SPEC.md` beside them, when exactly
one does. On acceptance, treat it exactly as a passed
`--spec` — Read it now — and note in the Tally that the spec Lens was activated from the
diff rather than from the flag; when Step 1 left a side of skipped kinds out unasked, ask the
scope question now. Do not make this offer twice, and never activate the
Lens without the user saying yes.

**Which files get judged** — the in-scope extensions, the skip list, and the rule
about a skipped dependency manifest that is the substance of the change — is in
`${CLAUDE_PLUGIN_ROOT}/references/scope.md`. Read it and apply it to the resolved
list. Then classify every surviving file by that file's `## File kinds` section —
`source`, `test`, `iac`, or `policy` — and record the kind beside each path: Step 2b gates the
`performance` Lens on the `source` subset, sends `policy` files to `security` and `spec` alone and
skipped files to `spec` alone, and the
`comments` Scanner's test-file bar (R11) keys off the same classification.

## Step 2 — Read project conventions and standards (once)

Settle the conventions note and the standards slot by the first half of
`${CLAUDE_PLUGIN_ROOT}/references/review-setup.md` — read it now; the mechanical read it works
from is in `${CLAUDE_PLUGIN_ROOT}/references/scope.md`. One note, written once, and every Scanner
reads that same file.

## Step 2b — Resolve the active lens set

Decide the set once, from the input and never from a preference, by the second half of
`${CLAUDE_PLUGIN_ROOT}/references/review-setup.md`. Record **N**, each active Lens's own
`<files>`, and every inactive Lens with its reason.

**Write the context directory.** The Scanners read the review's setup from files, never from a
brief you compose: eight retyped briefs paraphrased the contract, dropped its clauses, and took
two minutes of output before the first Scanner started. Make a fresh directory in the session
scratchpad (`mktemp -d` when there is none) and write into it, with the `Write` tool, the three
files `${CLAUDE_PLUGIN_ROOT}/skills/cr-prepare/SKILL.md` describes under **Write the context
directory**, in exactly that shape:

- `conventions.md` — the Step 2 note; `standards.md` — the standards slot, or `none`;
- `scope.json` — `checkout` the absolute path of the checkout under review (the PR worktree with
  `--pr`), `base` and `diff_args` from the script, `files` with each judged file's `status`, `kind` and
  `untracked`, `skipped` with its reasons, `spec` the absolute spec path or `null`, `spec_focus`
  `null`, and `lenses` with every Lens once — active with its own `files`, inactive with its
  reason — named by its rules file's basename (`readability-tests`, `naming-module`, …).

A review of named paths has no diff: write `diff_args` as `null` and `base` as `null`, and each
file's `status` as `A`. Read nothing back; the Scanners and Step 4 do.

## Step 3 — Dispatch N Scanners in parallel

Emit all N Scanner calls — **one per active Lens** — with the `Agent` tool in a
**single message**, each with `subagent_type: "code-review:scanner"` and this prompt, the lens
and the directory being the only parts that differ:

```
Invoke the `code-review:cr-scan` skill with `--lens <lens> --context <the context directory>`.
Return its closing block verbatim, and nothing else.
```

The `scanner` agent has only the tools a Scanner needs and loads no `CLAUDE.md`, so the
conventions note is the one house style it judges by. Pass no `model`: every Lens runs on the
session's model, because on the craft recall and calibration fixtures Sonnet matched Opus at a
higher cost and found the one real defect less often. Batching them in one message is what makes them run concurrently,
and a concurrent fan-out **runs in the background**: N agents cannot each block and
return inline at once, so the harness backgrounds them — this holds **even if you pass
`run_in_background: false`**, because the flag cannot make a concurrent fan-out
synchronous. Let them background; that is the working path.

**Without the `Agent` tool there is no review to run.** In some contexts — inside another
agent, inside a workflow step — it is simply absent, and a single pass by one reader is not this
command however carefully it reads. Say so in your first sentence, name the lenses that will not
run, and let the caller decide between an announced single-pass reading and the headless route:
`code-review:cr-prepare` once, `code-review:cr-scan` once per active lens as its own agent, then
`code-review:cr-merge` — the same nine lenses, one agent each, with no questions asked. Never
discover this silently halfway and report the result as a review.

**Never pass `name:` to a Scanner call.** Naming routes the Scanner into the agent-teams
mailbox, where its findings come back only if you ask for them and it answers — a channel
that has failed outright in practice, leaving an orchestrator with every Scanner signalling
`{"type":"idle_notification","idleReason":"available"}` and no findings to merge, and that
costs a round trip per lens even when it does work. An **unnamed** agent needs no asking:
its closing block arrives on its own in the `<result>` block of its `<task-notification>`.
You give up nothing by leaving them unnamed — there is nothing you need to say to a Scanner
once it has its prompt.

**Collect from the `<task-notification>` and the lens file.** Each Scanner's completion
notification carries its `cr-scan` closing block inside `<result>`, and its findings sit in
`<context>/<lens>.md` — the notification says the lens finished, the file is what you merge:

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
2. **Fail closed on a lens that did not deliver, not on silence.** The failure to catch is a
   closing block that is missing or reads `status: error`, or a `<lens>.md` that is missing, has
   no `Lens:` header, or presents itself as an **amendment, a correction, or a partial list** —
   that Scanner has **not** reported, whatever the file holds. Re-dispatch that one Lens as a
   fresh **unnamed** `code-review:scanner` and
   collect its `<task-notification>` the same way — this holds for every active Lens,
   `security`, `performance` and `spec` included. Never quietly review that lens yourself
   and pass the result off as a full N-lens review. If the re-dispatch also comes back empty,
   **tell the user that lens is unavailable** and ask whether to proceed without it or
   abort — those two are the whole menu, and "I read that lens inline myself" is not on it,
   however reasonable it looks as the recommended option. A single-pass or missing-lens review is a **labelled, user-acknowledged
   degradation**, never the silent default — that silent fallback is exactly how a single
   perspective's false positive reaches the report unchecked.
3. **Merge only once all N have delivered.** Merging early loses findings.

While the Scanners run, do work that doesn't depend on them — **pre-read the diff and the
changed files** so you can re-grade and locate sites the moment findings land. While you
have them open, run the **file-growth check**, which costs the Scanners nothing: compare
each changed file's line count before and after the change (`git diff --numstat
<diff_args> -- <path>` gives the lines added and removed; `wc -l` on the working copy
gives the head count). A file the change grows past **~1000 total lines** with no
decomposition in the same change gets its **own bullet in `Not flagged`** — a real
problem with no rule to land on, never compressed into the one-line list.

### What a Scanner returns

`cr-scan` assembles each Scanner's brief from the context directory and its own lens's rules, and
writes its output in the shape `${CLAUDE_PLUGIN_ROOT}/references/scanner-contract.md` defines —
the `Lens:` header line, the findings or verdicts, and the three side-channels. Read that contract's
**Three side-channels** before you merge: it is what each channel means. You never compose,
summarize or forward the contract yourself.

## Step 4 — Merge and re-grade

Read each active Lens's `<context>/<lens>.md` with the `Read` tool, one call per file, and merge
the N outputs by the **Merge and re-grade** half of
`${CLAUDE_PLUGIN_ROOT}/references/merge-contract.md` — read it now if you have not. Every rule
there binds this step: dedup, convergence, routing every `HANDOFF` and candidate, the published
`Reconciliation` line, `(verify)` resolution, re-grading against the severity table, and judging
each fix before it can reach Step 6.

**Check the grades against the table before you render.** Go down your merged list once with
`${CLAUDE_PLUGIN_ROOT}/references/severity.md` open and compare every bullet's severity with
its rule's row. A Scanner's grade drifts low far more often than high — a `composed-method`
shown as `medium`, a `security` finding as `nit` — and the row wins every time; a `standards`
finding is checked against its keyword. The only grade the table does not set is a finding's
existence: calibration may still clear it, but never soften it.

## Step 5 — Report (one per-file skeleton, two vocabularies side by side)

Render the review with **exactly** the skeleton in the **Report** half of
`${CLAUDE_PLUGIN_ROOT}/references/merge-contract.md`, and by every rule for filling it in that
follows the skeleton there — same structure between runs, nothing added.

**`Tally` ends the report text, not the turn.** Go straight into Step 6's
`AskUserQuestion` — or, in reviewer mode, into its draft and closing question — same turn,
no pause, nothing between it and the tally. A turn that
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

- **Safe fixes**, **Walk the structural ones (one at a time)**, **Boy-scout extras** and
  **Report only** — what each holds, how an unlisted or `standards` rule routes, why `security`
  is never safe and `spec` is report-only are the **Fix risk** section of
  `${CLAUDE_PLUGIN_ROOT}/references/merge-contract.md`; read it before composing the menu. When a
  canonical bucket is empty, `security` may take the freed slot as its own option, **Security
  fixes (walk one at a time)**, so the user can pick it apart from the craft restructuring.

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

**Ask the commit mode in the same call.** The same `AskUserQuestion` carries a second,
single-select question — how the fixes get committed — so the apply phase can commit as it
goes instead of rebuilding history afterwards:

- **Commit each family as it lands (Recommended)** — one commit per finding family the
  fixes come from (`comments`, each craft family, `security`, `correctness`…), each
  `security` fix in a commit of its own so it can be reverted or reviewed alone;
- **Fixup into the commit that introduced the line** — offered only when the branch has its
  own commits above the base (`git rev-list --count <base>..HEAD` above zero): each fix
  becomes a `git commit --fixup=<sha>` of the branch commit `git blame` names for the line
  it edits;
- **One commit** — every applied fix together, at the end;
- **Leave uncommitted** — the edits stay in the working tree for the user.

`Report only` alone makes the second answer moot; ignore it then.

**Put the review on disk before the apply phase starts.** The apply walk is the longest stretch
of the run and the one most likely to be compacted; when that happens mid-walk, the report and
the user's answer are gone, and a run that had to reconstruct its approved list by parsing its
own transcript spent that effort for nothing. Write the rendered report to a file in the session
scratchpad before the menu, and the user's selection — each approved finding with its file, site
and exact fix, and the commit mode — under it as soon as the answer arrives. Add the selection, and any later
mark on it, with `Edit`, never `cat >>`, `tee -a` or `sed -i`: this file is a file on disk like any
other. Read it back rather than recalling it, and say where it is in the wrap-up.

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
in part. This is the Orchestrator's alone: a Scanner writes only its own lens file.

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

**Commit as the fixes land, in the mode the user chose.** Apply family by family and commit
each family's edits before the next family touches the same files, so `git add <paths>`
always captures one family and never another's half — splitting one file's mixed edits by
hunk afterwards is the work this ordering avoids. The safe batch follows the same order:
its editors (or your inline edits) take one family at a time, and families whose edits share
no file may run together. In fixup mode, commit each fix as it
lands, blaming the line before the edit; a fix on a line no branch commit introduced (base
code, a boy-scout fix) gets a commit of its own. A fix that has to touch a file another
family's commit is still pending on waits until that commit is made.

**Walk the structural fixes yourself, one at a time — never fan these out.** They
move code, must be sequenced, and are verified by build/tests, so they stay under
your control even when the safe batch is parallelized. **Each one gets its own yes**:
picking the bucket in the menu chose the walk, not every edit in it. Before each, one
`AskUserQuestion` naming the finding, the site and the exact edit — apply it, skip it,
or (when you have one) a different approach — and apply only on that answer.

**Tick the approved list off as you go.** Mark each fix in the scratchpad file the moment it
lands, is skipped, or goes back to the user. Before the wrap-up, read the list back: an
approved fix with no mark was dropped, and it is applied now or reported as skipped with its
reason — never left out of the wrap-up because the walk moved on.

Once every edit has landed — inline, from the editor subagents, and from the
structural walk — re-run the project's build/tests if it has them, **once**:
reordering and unification can break things a blank line cannot. Then aggregate
what each editor applied or skipped into the wrap-up, and when a `secret-in-source`
fix landed, say plainly that the secret still needs rotating and that is the user's
step.

## Step 7 — Commit

The commit mode was answered with the menu in Step 6; this step never asks it again. Family and
fixup commits were made as the fixes landed. With **One commit**, make it now, after the
build/tests run. Either way the wrap-up lists the commits made (`git log --oneline
<first>^..HEAD`); in fixup mode it adds that folding them in is the user's step —
`git rebase -i --autosquash <base>` — never one the review runs.

Stage only the files the apply phase edited, by path — `git add <paths>`, never `-A` or `.`
— so the user's own uncommitted work and the review's scratchpad file stay out. Match the
repository's commit style from `git log`; a message describes the change, never "address
review findings". A hook that rejects a commit is reported with its output, never bypassed
with `--no-verify`.

**With `--pr`, also offer the push.** After the commits, one more `AskUserQuestion`: push
them to the PR's branch or keep them local. A same-repository PR pushes with
`git push origin HEAD:<headRefName>`. A cross-repository PR with `maintainerCanModify` pushes to
the head repository by URL —
`git push https://github.com/<headRepositoryOwner.login>/<headRepository.name>.git HEAD:<headRefName>`
— never to `origin`, which is the base repository: a push there would create or advance the base
repository's own branch of that name. A cross-repository PR without `maintainerCanModify` gets no
offer: say the branch is not writable from here and leave the commits in the worktree. Either way, name the
worktree's path and how to remove it (`git worktree remove <path>`) when the review made one.

## Reviewer mode — someone else's pull request

When Step 1 found that the PR's author is not the `gh` user, Steps 6 and 7 do not run:
nothing is edited, committed or pushed, and the worktree serves only for reading. Steps 1–5
run as usual, with two changes to the report:

- **Every bullet anchors to the head side of a diff hunk.** Its `L<lines>` are head-side line
  numbers inside one hunk of `git diff <diff_args> -- <path>` (read the `@@ … +start,count @@`
  headers), because GitHub accepts an inline comment only there. A finding whose lines fall
  outside every hunk says `file-level` in place of `L<lines>`; never move it to a nearby
  line that is in a hunk.
- **The draft is in English**, whatever language the conversation uses, and each comment
  opens with a Conventional Comments label taken from the finding: `high` → `issue:`,
  `medium` → `suggestion:`, `nit` → `nitpick:`; a comment verdict R9 → `issue:`, any other
  comment verdict → `suggestion:`. The label never softens or raises the graded severity.

**Leave out what the PR's reviewers already said.** Before drafting, read the review comments
already on the PR — `gh api repos/<owner>/<repo>/pulls/<number>/comments --paginate`, each with
its `path`, `line`, `start_line`, `original_line`, `original_start_line`, `original_commit_id`,
`body` and `user.login`. A comment on the same `path` whose lines overlap the finding's and that
makes the same point — the same defect, however it is worded — already raises it: the finding
gets no comment and no line in the review body, since a second voice on a raised point only adds
noise to the author's queue. Same lines with a different point is not a match, and neither is a
matching point on other lines. A comment GitHub marks outdated has `line` null: it was made at
`original_line` (from `original_start_line` for a range) of `original_commit_id`, an earlier
revision. It still raises its point when `git diff <original_commit_id> <headRefOid> -- <path>`
leaves those lines untouched; match it at the head lines they now sit on. A comment on lines the
branch has since changed raises nothing, even when the new code repeats the defect. After a
force-push or rebase `original_commit_id` may be missing from the fetched history: run
`git fetch origin <original_commit_id>`, and if the commit is still missing, treat the comment as
on changed lines — it raises nothing and the finding stays in the draft, since dropping a real
finding on a guess costs more than a repeated point. The wrap-up
names each point left out this way once — `path:L<lines>`, the finding, and who already raised
it, adding "on an earlier revision" for an outdated comment.

After the report, write the draft to a file in the session scratchpad as the request body of
`POST repos/<owner>/<repo>/pulls/<number>/reviews` (owner and repo from the PR's `url`):
`commit_id` set to `headRefOid`, `event` set to `COMMENT`, one `comments` entry per anchored
bullet (`path`, `line`, `side: RIGHT`, and `start_line` with `start_side: RIGHT` for a range,
`body` the labelled comment with its fix clause), and a `body` holding the headline plus every
`file-level` finding under its file path — the endpoint takes no file-level comment, so the
review body carries them.

**A fix that only replaces the commented lines ends its comment with a suggestion block** — a
`` ```suggestion `` fence holding the replacement for exactly the lines the comment spans
(`start_line` to `line`, or `line` alone), indented as in the file, which GitHub lets the author
commit with one click. Only when the replacement alone leaves the file correct: a fix that also
needs a line outside that range (a constant declared elsewhere, an import), reaches another hunk or
file, restructures code (a move, an extract, a rename across sites), or leaves the author a choice
between remedies stays a fix clause in prose — a suggestion committed on its own would break the
build or pick for them. The block lives in the draft only; the report keeps its no-fenced-code
rule.

Then, in the same turn, close with **one** `AskUserQuestion`:

- **Post as a COMMENT review** — `gh api repos/<owner>/<repo>/pulls/<number>/reviews --method
  POST --input <draft file>`, then report the review's URL from the response;
- **Keep the draft** — name the draft file and post nothing.

The review never approves, never requests changes, and posts only on that answer. Name the
worktree the review made and how to remove it (`git worktree remove <path>`).

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
