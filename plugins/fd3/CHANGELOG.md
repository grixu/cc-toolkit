# Changelog

All notable changes to the **fd3** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- `split-to-tasks` accepts a `ready` verdict that carries a declared gap: the blocked claim
  becomes an operational task naming its owner, instead of stopping the split; an ownerless
  blocked claim still stops it

### Added

- `grill-topic` writes what the conversation established before the command into the research
  directory before round 1, and keeps a question ledger file — round numbers, answers and
  carry-overs no longer live only in a context that gets compacted
- The spec template caps every table cell at two sentences and sends longer evidence to
  `evidence/<section>.md`, with a per-pass overflow file for a validation block that outgrows the
  appendix
- `split-to-tasks` cuts a protected path — one guarded by `CODEOWNERS`, branch protection, or a
  required review — into a delivery task on its own branch, so one external approval no longer
  holds a whole landing unit
- A `depends-on` edge between two tasks on the same branch must name the file or symbol they
  share, in the dependent task's `## Note` and in the report; an edge that cannot be named is
  dropped, because it only serialises the implementation stage

### Fixed

- A gap the spec already declares with an owner and a placement is `deferred` on sight — it never
  reaches the user as a question, and it never lowers a verdict or a phase row
- An operational task exists only for hand-run steps no repository carries; a phase's own
  verification rows are run by the repositories' checks and raise no task
- A `ready` verdict no longer hides an ownerless gap: `validate-spec` returns `ready` only when
  every claim is `verified` or `deferred`, and asking the user for an owner is the last move
  before a claim is recorded `blocked`
- `build-spec` re-invokes validation when the previous pass edited the spec, not only when the
  verdict was not ready — a `ready` verdict on a document that same pass rewrote judged the
  version before those edits — and each re-invocation carries a focus list of open findings and
  edited sections
- The validation return prints all twelve check rows with their fixed numbering and short names,
  and the report reference says to re-read it after a compaction
- A HIL CI failure is diagnosed by running the failing check in the branch's worktree, not by
  grepping the source for what the message suggests
- A repair `instructions` line says what to change and never asks the agent to validate — the
  workflow runs CI itself, and a second pipeline on the machine is exactly what validation cannot
  tolerate
- The closing proposal names each branch's worktree path, whatever the user decides about pushing
- The split reads the spec at its absolute path and never lets the spec's own commit location
  decide a branch base — a spec committed on a feature or docs branch no longer roots the stack
  there

- CI verdicts now describe the branch they claim to: the toolchain scout reports each command's
  `cwd` relative to the repository root, the CI prompt `cd`s into the worktree and reads
  `git branch --show-current`, and `implement-run` / `repair-run` discard a verdict whose branch
  is not the unit's — previously an absolute `cwd` sent every command into the repository's main
  checkout, so stacked branches were marked done on another branch's code
- A CI runner that edits its way to green no longer produces a pass: regenerating a derived
  artifact counts as fixing, the runner returns `git status --porcelain`, and a verdict from a
  tree carrying uncommitted changes beyond the task files is discarded as `no-verdict`
- A target branch that is the repository's own checkout is now validated in a detached worktree
  at the branch's commit, so the user's uncommitted work and the tasks directory are no longer
  part of the tree under test; merges and fixes still happen in the checkout
- The merge and CI prompts no longer claim the task files live outside the repository — they say
  what actually holds: edit them at their absolute paths, commit nothing, touch nothing else
- `implement-tasks` says that a pre-launch commit of the spec and tasks directory must carry the
  repository's regenerated indexes, or say it did not — a stale one fails every branch at once
- `implement-tasks` step 2 offers only review skills that review inline, and expands a fan-out
  orchestrator the user names (`code-review:start-cr`) into its single-lens skills — inside a
  workflow agent there is no `Agent` tool, so the orchestrator silently degraded to one pass

## [0.1.0] - 2026-09-04

### Added

- `grill-topic` skill — round-by-round design-tree interview over a topic passed as an argument
- `/fd3:build-spec` command — thin entry point that delegates to the `grill-topic` skill
- `researcher` sub-agent skeleton for documentation lookups dispatched from the skills
- promptfoo eval suite under `evals/` — deterministic skill-contract scenarios (validate-spec,
  split-to-tasks, write-spec, grill-topic, build-spec gate) plus explicit-only e2e and
  network/researcher groups, hand-authored fixtures with `DEFECTS.md` contracts, sandbox reset
  script, and a CI smoke workflow
- `implement-run`: baseline pass per repository — after the toolchain scout, a haiku agent runs
  the full validation suite on the clean base; CI and review agents receive the baseline and
  classify matching failures as `preExisting`, so fix agents never fight pre-existing noise
- `implement-run`: scoped CI during fix rounds (orchestrator filters / changed paths), with one
  full run as the final gate before a branch is marked done
- `repair-run` workflow — applies the user's HIL decisions to existing branches (decision text
  is the sole authority; spec reads forbidden), then re-validates with CI only, no code review;
  reuses `toolchain`/`baseline` from the implement-run report
- `implement-tasks` skill: step 4 split into an unblock lane (relaunch `implement-run`) and a
  repair lane (launch `repair-run`), never both workflows at once
- `implement-run`/`repair-run`: reservations channel — review and fix agents receive the run's
  open HIL items and unreachable tasks, so a deliberate gap (a human-reserved migration, a
  blocked task's missing artifact) is reported, never "fixed"; fix prompts carry the blocker
  clause implement prompts already had
- `implement-run`/`repair-run`: fix agents return a structured result (`FIX_RESULT`) with
  `caveats`; implement, repair and merge agents gained caveat channels too (as-built deviations,
  literal-decision side effects, mechanically resolved conflicts), all aggregated into a new
  `caveats` key of the report — flagged facts no longer die in agent transcripts
- `implement-run`: stack-base refresh — before validating a branch that stacks on another unit
  validated earlier in the run, a merge agent brings the base's CI/review fixes in, so the
  stacked branch no longer re-fails and re-fixes the base's problems divergently
- `implement-run`: the full final gate gets one fix round before going to HIL — a mechanical
  failure (a derived artifact invalidated by review fixes) no longer costs a human round-trip
- `implement-run`/`repair-run`: accept an optional `reportPath` — the previous run's report file —
  and read its `toolchain`/`baseline` knowledge with one cheap agent, so a relaunch reuses recon
  instead of re-scouting and re-baselining; the older `toolchain`/`baseline` args still work for a
  caller that already holds the reports
- `implement-run`: operational tasks get `status: blocked` written to their files (previously
  memory-only, violating the state-store axiom); status writes are owned by this writer and the
  done-marker alone
- `implement-tasks` skill: step 4 — read the full report from the notification's output file
  (the inline result truncates), relay totals only from the report's `tasks[]` tally, relay
  caveats; read-only diagnosis of CI HIL items feeding the repair `instructions`; mechanical
  git-op carve-out (merge/revert leaving an intentionally incomplete branch); post-relaunch
  check that branches respect standing HIL decisions; HIL handoff file offer when a run parks
  on human work
- `implement-tasks` skill: step 5 triggers on all repository-bearing tasks `done` (operational
  tasks listed, never gating); cleanup consent decoupled from push consent; untracked tasks-dir
  state-store warning
- task status `merged` — the code has reached its target branch and the target is waiting on
  validation, distinct from `implemented` (code on the task's own branch only); the merge agent
  writes it as part of the merge it just performed. The status reports what happened and is never
  the authority on it: git still decides, and `implemented` and `merged` both re-enter the merge
  round on a resumed run
- `validate-spec`: a blocking finding whose repair would change the spec's scope or reverse a
  ratified decision is handed up as a repair choice — the defect, the repairs to pick between, and
  what each costs — instead of being recorded as a defect nobody may touch; one obvious correction
  is not a choice, and a non-blocking finding never is
- `CONTEXT.md` records the `merged` status alongside the other five

### Fixed

- `implement-run`/`repair-run`: the baseline pass is created in Recon and awaited in Validate, so a
  rejection in between had no handler and would take a multi-hour run down on Node's
  unhandled-rejection default; it now degrades into the same `no-verdict` item a missing baseline
  produces
- `implement-run`/`repair-run`: `maxFixRounds` defaults to 3 — arriving `undefined` made every
  `fixRounds < maxFixRounds` false, silently skipping the CI fix rounds the run exists to perform
- `implement-run`: a `branch-base` naming a branch no task builds is reported instead of silently
  demoting the task to a stack root — `.every()` over no producers is vacuously true, so a typo was
  indistinguishable from a genuine root and lost the stacking order
- `validate-spec`: check 1 is a `spec-template.md` question, not a `spec-rules.md` rule — the
  sentence that routes each check to its file sent it to the wrong one
- fd3 evals: the firecrawl MCP key travels in an `Authorization` header rather than in the URL
  path, where it would reach connection errors, proxy logs and the exported run JSON
- `implement-run`: the stack-base diagnostic carries `slug: null` — every slug-bearing HIL entry
  renders into the human-owned and reservation lists, which tell the implement, fix and review
  agents to keep off a task that is in fact still being implemented
- `implement-tasks`: step 1 checks that every stack base is reachable — a `branch-base` no task
  builds and git cannot resolve becomes a step-2 question instead of a post-run diagnostic. Only
  the skill can tell a typo from a real branch the split rooted on; the workflow sees the task
  files alone, so it cut the branch from the default ref and reported the lost stacking after the
  work was built on it. A base no task builds and naming the repository's default branch or the
  branch its checkout is parked on — the two refs the split can root on — is normalised to
  `baseBranch: null`, so step 2 settles which of them the run uses. Left as a string, the base is
  taken by the start-point chain directly: the first landing unit is cut from it and the step-2
  answer is discarded, besides raising a diagnostic per repository on every run. A base launched
  despite resolving nowhere is passed through, so the report records what was consented to
- `implement-tasks`: a `graph` HIL item is relayed as a diagnostic, not as a parked human step —
  the tasks ran normally, and what it asks for is a corrected task file before the next split; the
  item is raised once per dangling base rather than once per task, since `branch-base` is identical
  on every task of a branch
- `validate-spec`/`validation-report`: check 9 has a pass form of its own, `pass (verified — <what
  you read>)` — the three general `Result` values left a ran-and-holds check 9 with nothing legal to
  write, since `unchanged` on that row reports the document rather than the lookup
- fd3 evals: the split assertions require `branch-base` and `decisions`, the two task frontmatter
  fields they did not cover; a skipped check 9 (`pass (unchanged)`) no longer counts as a pass in
  the clean-spec assertion; the defective fixture carries the template's fifth rollout column and a
  risks-accepted table, so neither produces a sixth finding against its own contract
- `fd3-evals` CI: the path filter covers `scripts/run-evals.sh` and the root `package.json`, and the
  job no longer asks `setup-node` to cache a pnpm store keyed on a lockfile this repo does not commit
- fd3 `description` and README: the published marketplace description was literally `TBD`, and the
  README documented one of two commands, one of five skills, one of two agents and no workflows

### Changed

- `implement-run`: every agent call retries once on a null result; a second null becomes a
  `no-verdict` HIL entry — agent deaths are no longer reported as CI failures, two dead review
  lenses no longer count as a clean review, and tasks are marked `done` in the report only
  after the done-marking agent confirms the files were updated
- `implement-run`: worktrees and target branches are cut from each repository's `defaultRef`
  (fresh `origin/<default>` or the user-chosen base) passed in the new `repos` arg, never from
  stale local refs; review lenses diff against the branch's stack base, not the default branch
- `implement-tasks` skill: mandatory `git fetch origin` in step 1; per-repo base questions in
  step 2 (repo parked on a non-default branch, base behind `origin/<default>`); step 3 states
  the full launch contract, so the model never reads the workflow script
- `implement-run`: CI runner, baseline, and done-marking agents run on haiku (mechanical work);
  code-editing agents keep the session model
- `toolchain-scout`: the output contract now carries a scoped invocation form per command (or
  `not scopeable` with the reason)
- `split-to-tasks`: an element no work item builds is assigned-and-flagged when exactly one work
  item's cited files contain it (stop only when its home is ambiguous); an operational task exists
  for any gate whose hand-run steps no repository carries, dependents or not; a checkout parked on
  a branch carrying the spec's commits makes the first landing unit's branch identity a user
  question
- `validate-spec`: dispatch may partition by disjoint code territories (exclusive, named in every
  prompt), not only by section or repository
- `validation-report` reference: mechanical corrections aggregate into one non-blocking bullet;
  "Closed during this run" is reserved for findings that would have blocked
- `fact-routes` reference: a known one-or-two-call authenticated lookup needs no dispatch — the
  orchestrator makes it itself
- `implement-run`/`repair-run`: CI and baseline schemas gained a `skipped` field — a skipped
  command is reported with its reason, never as passed; CI prompts skip commands the baseline
  already shows failing, quote shell paths, and diff against the stated base (never the branch
  itself); merge results record mechanically `resolved` conflicts so review knows where to look
- `implement-run`: implement prompts state the explicit start-point fallback chain (target
  branch → stack base → default ref) and allow a build when the task's deliverable is a
  generated artifact; a target branch parked as the repository's checkout is declared via
  `repos[].parkedBranch` instead of being discovered through git's refusal
- `implement-run`: per-branch validation summaries carry review `findings` text, not only the
  count — the skill can relay what review caught without mining the journal
- `toolchain-scout`: install commands are always listed as required-in-a-fresh-worktree (the
  caller runs commands in worktrees that share no `node_modules`), and command templates that
  write scratch comparison artifacts must remove them
- `split-to-tasks`: no `depends-on` edge onto an operational task when the spec lets the code
  land before that gate (verification-only dependencies belong in Done-when); a task changing a
  shared identity/contract shape owns the propagation to every consumer, fixtures and seeds
  included, or hands it to a named task
- `validate-spec`: check 1 also catches intra-element contradictions — an element whose own
  requirements cannot all hold at once
- `validate-spec`/`build-spec`: a pass is one invocation; a `SendMessage` resumes a stopped pass
  rather than starting a new one, and a re-invocation is the fresh reading that re-checks the
  previous pass's own edits
- `validate-spec`: check 9 gained a procedure — read how a change of this shape actually lands in
  each repository and check the ownership section's apply mechanism against it; a landing claim
  needs an evidence row, and `pass (unchanged)` there means the check did not run
- `validate-spec`: check 7 covers elements that are not code-shaped, and a plural claim ("both
  monitors", "all three stacks") is checked member by member; check 8 also joins each work item's
  phase and landing shape to the rollout table
- `validate-spec`: a probe measures one direction — where the pass probes what removing something
  costs, it asks what adding it costs
- `spec-template`: work items are a table carrying **Phase** and **Lands as**, the join a task
  split cannot reconstruct; `write-spec` fills both cells last, once the rollout table and the
  landing constraints are settled
- `spec-template`: section 7 distinguishes an ordering that binds the merge from one that binds
  only the deploy — told just "A before B", a split stacks B on A and serialises work that could
  have run in parallel
- `spec-template`: every verification row states **where** it runs — branch, merged base, or a
  named deployed environment
- `task-template`: a Done-when row that cannot pass from a branch at all is named
  **environment-level** and points at the operational task or gate that exercises it
- `task-template`: `decisions:` is a named frontmatter field rather than an invention two splits
  reached for independently
- `split-to-tasks`: under one-branch-per-task only a real ordering stacks — tasks changing disjoint
  targets are siblings, and a stack link costs one full validation ladder per branch downstream
- `split-to-tasks`: a gate that blocks *authorship* is a real `depends-on` edge onto its
  operational task, and a missing operational task for it is a coverage failure
- `split-to-tasks`: coverage also checks that every rollout phase reaches a task, that every
  hand-run gate has an operational task, and that every Done-when row carries one of the three
  classes
- `fact-routes`: the unnamed-dispatch rule binds at every level and travels down in the prompt —
  an agent that fans out is answerable for its children's reports arriving; routing also weighs
  cost, and the model is stated in the dispatch rather than defaulted
- `implement-tasks`/`split-to-tasks`: the workflow checklist is posted before any tool call and
  never compressed to a line or summarised
- `implement-tasks`: the relaunch and repair contracts pass the previous report's path — never its
  toolchain and baseline knowledge transcribed by hand
- `implement-run`/`repair-run`: a repository that had to be re-scouted drops any inherited
  baseline — `baselineText()` matches by command string, so a baseline from a different scout
  report silently stops covering commands it never named
- `implement-run`/`repair-run`: every validation label carries the unit (`<repo>:<branch>`), not
  just the repository, and a review skill's own colon is neutralised in the lens segment
- `build-spec`: step 3 names validation as the step that repairs the spec, not only the one that
  counts its defects — a verdict listing no edits on a spec that had findings is called out as such
- `write-spec`: the three input paths arrive through `$ARGUMENTS`; the `arguments:` frontmatter key
  it declared them under is not a skill field and never substituted anything
- `validate-spec`: one hand-up batch per pass — nothing outstanding when it goes, and steps 3–5
  return there only because an answer opened a new fact, never because a lookup had not finished
- `split-to-tasks`: the `branch-base` root may be a branch the checkout already carries the spec's
  commits on — that is the step-6 question, not a coverage failure that aborts an authorised split
- `split-to-tasks`: a target directory holding task files is always a question, a re-split of the
  same spec included, because implementation writes its state into those files
- `split-to-tasks`: each rendering fork gets an exclusive territory, naming what belongs to the
  other agents and writing nothing outside its own list
- `implement-run`/`repair-run`: the branch's final gate sets the task files to `done` itself and
  confirms it in its result — a separate marking agent per branch spent its whole budget booting to
  edit one frontmatter line; `tasksDir` is no longer an argument, the files are passed by path
