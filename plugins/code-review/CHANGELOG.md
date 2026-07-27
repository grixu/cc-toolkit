# Changelog

All notable changes to the **code-review** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Prompt-surface pass against the published guidance for Claude Opus 5, the general
prompting best practices, and the Skill authoring best practices.

### Added

- **`CANDIDATES` channel** — a Scanner now reports a site it confirmed and owns but
  whose rule fit or calibration it could not settle, instead of dropping it at
  detection. The Orchestrator promotes it to a graded finding or clears it into
  `Not flagged`. Detection and filtering are now separate jobs: suppressing at
  detection made the review under-report, since a model that is told to be
  conservative follows that instruction literally. The standalone skills run the same
  split as two passes in one head. `(verify)`, `HANDOFF`, and `CANDIDATES` carry three
  distinct meanings and a disambiguation table keeps them from being conflated.
- **`references/severity.md`** — the master severity table (22 rules), the definition
  of each severity, and the anti-anchoring rule, in one place. `/start-cr` and
  `quality-review` read it instead of each carrying a copy that had to stay
  byte-identical.
- **`references/scope.md`** — the in-scope/skip lists, the language-applicability
  rules, the dependency-manifest note, and the mechanical convention read, shared by
  all three surfaces.
- **A worked report example** in each surface, alongside the skeleton — a filled-in
  report steers format more reliably than a template of placeholders.
- **An XML `<scanner_brief>` template** for the `/start-cr` fan-out, replacing the
  prose list of what each Scanner receives.
- **`Contents` blocks** in the rules files over 100 lines, so a partial read still
  shows the full scope of the file.
- **A quality eval track** — `prompts/quality.txt` plus three fixtures: vocabulary and
  skeleton adherence, a recall gate (a seeded high + medium + nit must all surface),
  and a noise gate (five documented look-alikes must stay non-findings). The suite
  previously covered only `comment-review`. The recall and noise gates pass on both
  sonnet-4-6 and opus-5 in every measured run; the skeleton test is flaky (4/8–7/8,
  no stable model split) and is documented in `evals/README.md` as indicative rather
  than pass/fail.

### Changed

- **Narration and length** — each surface carries a short `<review_tone>` block:
  one sentence before the first tool call, updates only on a real finding or a change
  of direction, outcome first in the wrap-up, and the report matched to the findings.
- **Register calmed.** `MANDATORY`, stacked emphasis, and the most redundant negative
  phrasings are gone; the instructions they carried are unchanged. Aggressive phrasing
  now overtriggers rather than helping.
- **`comment-review` enumerates every comment before judging any of them** — a run of
  similar-looking banners is where one quietly went unlisted, and a skipped comment
  reads as a KEEP to the author.
- `/start-cr` is 528 → 503 lines and `quality-review` 367 → 311, despite the worked
  examples and tone blocks, through the shared-reference extraction. Both skill bodies
  (`quality-review` 311, `comment-review` 205) sit under the 500-line guidance; that
  guidance covers SKILL.md, not the command.
- **The report skeleton is stated as unconditional and code-free.** A `simplicity`
  rule had told the scanner to "show the unified version concretely", which the model
  read as a licence to paste a rewritten body into the report — directly against the
  report's clause-only contract. All four quality rules files now state that a
  suggested fix is one clause. This reliably removed fenced code blocks from quality
  reports; the surrounding header structure is still not deterministic (see above).

### Removed

- **Self-verification scaffolding** — the separate severity self-check pass (redundant
  with the anti-anchoring rule beside it) and the repeated "read your own suggested fix
  back one more time" re-checks, which were stated up to five times across the
  surfaces. Opus 5 verifies its own work unprompted, and these compound into wasted
  tokens. External checks — build/tests after a structural change, Read-before-edit,
  locating a site by content rather than line number — all stay.
- **`quality-review`'s >20-file fan-out (Step 1.5, ~50 lines).** The path was never
  validated, the background-subagent plumbing it relied on delivers status without
  findings, and Opus 5 delegates more readily than the models it was written for. The
  skill is now inline-only and points at `/start-cr` for a diff too large to hold at
  once; `Task` is gone from its `allowed-tools`.
- The stray `skills/comment-review/evals/` directory — its fixtures were byte-identical
  duplicates of the canonical suite and its `evals.json` was superseded by
  `promptfooconfig.yaml`.

### Fixed

- **Scanners are dispatched unnamed and collected from their `<task-notification>`.**
  The collect step had named each Scanner and told the Orchestrator to `SendMessage` it
  and "block on that reply". `SendMessage` does not block — it returns a routing receipt
  and hands control straight back — so the step specified behaviour the tool does not
  have. Naming also routes a Scanner into the agent-teams mailbox, which replied in one
  measured run and not at all in another: five lenses idle, nothing merged, and roughly
  half the run's scanner compute spent on lenses that never delivered a word. An unnamed
  Scanner instead delivers its full output unprompted in the `<result>` block of its
  completion notification, in three of three measured runs. Fail-closed now triggers on
  an empty or truncated `<result>` rather than on an idle signal, and chasing a slow
  Scanner is called out as counterproductive — it makes the Scanner regenerate its whole
  output, which can land after the merge has already rendered. The apply-phase editor
  fan-out rested on the same misattribution (it blamed backgrounding for what naming
  causes) and is corrected alongside it.
- **A Scanner could write into the working tree.** Its contract said only "does not edit
  files", and in two measured runs a Scanner created a scratch TypeScript file inside the
  user's repository to typecheck a hypothesis against. The brief now states that a
  Scanner writes nothing into the tree — neither the files under review nor a probe file
  — and settles a doubt by reading the type, the signature, or the call site, marking the
  rest `(verify)`. Scanners still spawn as `general-purpose` and hold `Write`, so this is
  a contract, not an enforcement.
- **`quality-review`'s `description` was 1153 characters, over the hard 1024-character
  limit** for a Skill description; trimmed to 1007 with every trigger phrase kept.
- **`quality-review` declared `allowed-tools: … Task`** while the subagent tool is
  named `Agent`. Moot now that the skill does not delegate, but it would have failed
  had the fan-out ever fired.

## [0.1.0] - 2026-07-23

### Added

- Initial release: `code-review` merges the `comment-review` (0.5.0) and
  `quality-review` (0.4.0) plugins under one fan-out orchestrator.
- **`/start-cr` command** — resolves review scope once (current branch diff by
  default, or explicit paths / `--base`), then dispatches **five parallel
  scanners**, one per lens: comments (`R1`–`R12`), readability & tests, naming &
  module, objects & patterns, simplicity & types. It merges their findings
  (dedup, most-specific wins), re-grades quality severities centrally, renders one
  per-file report with the comment and quality vocabularies side by side, and ends
  in a single risk-cut apply menu. It never edits during the review; once fixes are
  approved, mechanical batches fan out across per-file editor subagents (ownership
  disjoint by file) while structural changes are walked one at a time, and every
  site is re-located by content — Scanner line numbers are treated as estimates.
- **Standalone skills stay invocable**: `comment-review` (comment quality only)
  and `quality-review` (quality & craft only) remain available for a single-lens
  pass, sharing the same rule text as `/start-cr`.
- **Per-lens rules files** (`references/rules/<lens>.md`) are the single source of
  truth for each lens's rule text, read by both the standalone skills and
  `/start-cr`. One shared `scripts/get_changes.py` resolves the diff scope.
- **`tests` · `test-fidelity` rule** — flags a test whose name or fixture claims a
  boundary its assertions don't actually check (passes while guarding the wrong
  thing).
- **Concurrent fan-out runs in the background** — `/start-cr` emits its five scanners in
  one message, which runs them concurrently; a concurrent fan-out is backgrounded by the
  harness (a `run_in_background: false` flag can't make it synchronous), so the
  orchestrator waits for the five completion notifications and never polls, pre-reading
  the diff while it waits. Editor subagents in the apply phase stay foreground.
- **Cross-lens `HANDOFF`** — a Scanner routes an out-of-family finding to the
  orchestrator, which grades it against the master table instead of losing it in
  prose.
- **`(verify)` resolution before apply** — a finding a Scanner couldn't confirm (a
  `needless-cast` above all) is verified centrally before the report and never enters
  an apply batch unconfirmed.
- **Severity self-check** — the orchestrator checks every finding's severity against
  the master table before rendering, so one rule can't appear with two severities.
- **Apply menu capped at four options** — the four canonical risk buckets are the
  whole menu, honoring `AskUserQuestion`'s limit.
- **Severity vocabulary pinned** — a Scanner grades `high`, `medium`, or `nit` and
  nothing else, including in lenses whose own rules file lists only one of the three.
- **Cross-lens convergence is a confidence signal** — a finding several Scanners
  reached independently leads its file and is a headline candidate; convergence never
  moves severity, which stays verbatim from the master table.
- **Editor fan-out has a countable threshold** — the safe batch fans out on four or
  more files not yet read this session, and is applied inline otherwise, so an editor
  never pays a second read for a file the orchestrator already holds.
- **Scanners resolve their own doubts** — `(verify)` is reserved for what a Scanner
  genuinely cannot check (runtime behaviour, out-of-scope files) instead of being the
  default for any uncertain finding.
- **`Not flagged` may itemize** — a real problem with no rule to land on gets its own
  bullet instead of being compressed into a subordinate clause.
- **Findings sections hold findings only** — a checked-and-cleared item goes in prose,
  never in the finding shape with a dash where the severity belongs.
- **A fully added file has no boy-scout findings** — every finding in a status-`A` file
  is primary, since the whole file is code the change introduced.
- **Duplication findings sweep the whole file** — a Scanner flagging repeated code lists
  every copy in the file, not just the ones inside the diffed hunk, so the extraction
  fix can't leave a straggler behind.
- **Convention sources include `.claude/rules/`** — Step 2 reads every `.claude/rules/*.md`
  (and re-asserts the repo-root `CLAUDE.md`/`AGENTS.md`) before dispatch, so a
  repo-sanctioned convention such as an `AGENTS-NOTE:` anchor-comment prefix can't surface
  as a finding.
- **Scope list reused, not recomputed** — Step 1 reuses the file list detection already
  produced for `uncommitted`/`committed`, re-running the script only for the `Both` scope.
- **`simplicity · dead-code` rule** — flags code that can never run or whose result is
  never used (an unreachable branch, an unread binding); graded `high`.
- **Dedup keeps the higher severity** — when overlapping findings merge across a severity
  gap, the surviving bullet carries the highest severity of the overlap, so a `high` can't
  be demoted under a `medium` root cause.

### Documentation

- README states plainly that this is a craft review, not a security or correctness
  audit.

## [0.0.0]

- Scaffold.
