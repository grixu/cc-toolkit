# Changelog

All notable changes to the **dev-kit** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `pr-shepherd`: stacks: several PR numbers run per PR in its own worktree; a fix lands on the lowest owning branch and reaches the others by a plain base-into-child merge, never a rebase and never from the default branch; a thread another PR in the stack fixes is answered with that commit
- `pr-shepherd`: a `decision` verdict for a comment whose fix is a trade-off only the owner can make: one reply with the options and their cost, the thread left unresolved and handed over in the report

### Changed
- `pr-shepherd`: every red check goes through `ci-fix`, never a direct fix or rerun; the fix cap counts every fix or rerun cycle on a check; a red non-required check gets one `ci-fix` run, then is reported to the user instead of passing silently
- `pr-shepherd`: a `CONFLICTING` PR is taken as GitHub reports it, never closed, reopened, retargeted or edited; the loop skips CI, still handles review threads and pushes, then stops naming the conflicting files
- `pr-shepherd`: the per-iteration state fetch leaves out comment and review bodies, which step 3 reads trimmed; the branch is compared with `origin/<headRefName>`, so a branch without an upstream no longer fails step 1
- `ci-fix`, `dep-upgrade-check`: when `--log-failed` is empty or answers 403/404, read the job log through the API, the step conclusions and the check-run annotations before concluding anything
- `pr-shepherd`, `ci-fix`: stage by explicit file path, never a directory, `-A` or `-a`; untracked files never block `pr-shepherd` and are never staged. `pr-open` asks only about tracked changes and lists untracked paths as not in the PR
- `pr-shepherd`, `ci-fix`, `pr-open`: the push authorization excludes merging or rebasing the base, resolving conflicts, force-pushing and changing the PR unless a later message names the action, and counts as the per-branch consent a repository rule reserving `git push` for humans asks for
- README rewritten for first-time users: requirements, per-skill examples, outputs and stop rules, and a per-skill table of pre-approved commands that corrects the earlier claim that `ci-fix` and `pr-shepherd` pre-approve every `git` and `gh` command they run

## [0.1.0] - 2026-09-25

### Added
- `ci-fix` skill: locate a failed GitHub Actions run from a URL or the current branch, fix it at its root cause, verify locally, and commit; pushes on consent, or unattended with `push-authorized`
- `pr-shepherd` skill: self-paced `/loop` that drives the current branch's PR until CI is green and review threads are resolved, fixing CI via `ci-fix`, committing justified review changes, and rebutting unjustified comments in-thread
- `dep-upgrade-check` skill: read-only compatibility check of a dependency upgrade (package + version, or a Renovate/Dependabot PR) against the codebase, with a verdict and file:line impact table
- `pr-open` skill: push the current branch and open a PR that fills the repository's PR template in Smart Brevity style
