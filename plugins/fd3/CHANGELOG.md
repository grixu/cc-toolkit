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
