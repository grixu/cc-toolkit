# Changelog

All notable changes to the **fd3** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- `implement-run`: accepts optional `toolchain`/`baseline` args like `repair-run`, so a relaunch
  reuses recon knowledge instead of re-scouting and re-baselining
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
