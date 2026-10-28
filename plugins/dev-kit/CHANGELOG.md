# Changelog

All notable changes to the **dev-kit** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- `dep-upgrade-check`: a re-run that carries a maintainer's decision reports the decision itself in the result block's `decision` (no more `carried`), and the new `decision_carried: true | false` says where it came from, so a CI gate can pass a carried acceptance and fail a carried hold

## [0.4.0] - 2026-10-28

### Added
- `dep-upgrade-check`: an `unattended` argument, also switched on by `GITHUB_ACTIONS=true`, for a CI job: nothing asks, an ask point stops with a reason, an escalated outcome posts its security comment at once with the decision `pending`, and a re-run keeps a maintainer's recorded decision while the packages, targets and advisories stay the same
- `dep-upgrade-check`: every run ends with a parseable `dep-upgrade-check-result` block
- `dep-upgrade-check`: an unattended run on a pull request posts the full report as a second comment, updated in place on a re-run
- `dep-upgrade-check`: without the firecrawl and context7 servers, migration guides come from the package repository's guide files, then from the guide the release notes link to; a missing guide is listed under the unknowns
- README: a reference GitHub Actions job for Renovate pull requests

### Fixed
- `dep-upgrade-check`: a pull request's current version comes from the base branch's lockfile, so a checkout of the PR branch or its merge commit no longer yields an empty range and a false `safe`
- `dep-upgrade-check`: the security comment is updated, not duplicated, under an installation token (`GITHUB_TOKEN`, a GitHub App), which cannot read `GET /user`

### Changed
- `dep-upgrade-check`: pre-approves every command it runs on the pnpm path, including `gh api` (writes included), `gh pr comment`, `git fetch`/`show`, the OSV and deps.dev `curl` calls, file writes and WebFetch

## [0.3.0] - 2026-10-26

### Added
- `dep-upgrade-check`: a security step before the change ledger checks the target, and every new or changed transitive version it brings in, in OSV.dev and the GitHub Advisory Database (malware included) and gives each unit `clear`, `escalated` or `blocked`; the rules and lookups live in the new `security.md`
- `dep-upgrade-check`: `blocked` for malware, a version gone from the registry, or a version under 7 days old unless it fixes a moderate-or-above advisory of the version it replaces; the report names the minimum safe version
- `dep-upgrade-check`: `escalated` for a moderate-or-above advisory (missing severity counts as moderate); the advisory is mapped to `file:line` uses as information that never lowers it, and the user picks accept, switch to the minimum safe version, or hold; when only transitive versions pinned in the PR lockfile escalate and their declared range admits a fix, a lockfile refresh of those packages takes the place of the minimum safe version
- `dep-upgrade-check`: a PR input always gets one security comment with the outcome, the advisories and the user's decision, updated in place on a re-run; private-registry packages are never sent to an external lookup and are listed as not checked
- `dep-upgrade-check`: a PR or monorepo with several units takes the worst outcome and asks one question per escalated unit in a single round; malware on the current version gets its own line as an active compromise
- `dep-upgrade-check`: `ecosystems.md` gains the OSV and GHSA ecosystem names, the publish-time source, and the lockfile for the transitive diff per ecosystem

## [0.2.0] - 2026-10-25

### Added
- A mod with the `pr_risk` tool (`mcp__dev-kit__pr_risk`): assesses `<base>...HEAD` with the TypeSafe Jev model and returns a risk level, confidence and risk flags. It is registered only when a key is set (the `typesafe_api_key` option, else `TYPESAFE_API_KEY`), and its endpoint, model, label and level names are plugin options. Diffs over Jev's context are compacted, then split into up to 8 requests
- `pr-open`: with the `pr_risk` tool available, the body ends with a **Risk** section and the PR gets a configurable risk label; on an existing PR the label is swapped and the **Risk** section refreshed; the report gives the level or why it was not assessed
- `dep-upgrade-check`: a `split resolution` ledger kind for a PR head lockfile holding old and new copies whose classes or nominal types cross package boundaries, fixed by a targeted `pnpm update -r <pkg>` or a dedupe
- `dep-upgrade-check`: while a load-bearing unknown remains, the verdict is the worst it could resolve to, marked `provisional`, with the unknown named and the local build offered in the same message
- `pr-shepherd`: stacks: several PR numbers run per PR in its own worktree; a fix lands on the lowest owning branch and reaches the others by a plain base-into-child merge, never a rebase and never from the default branch; a thread another PR in the stack fixes is answered with that commit
- `pr-shepherd`: a `decision` verdict for a comment whose fix is a trade-off only the owner can make: one reply with the options and their cost, the thread left unresolved and handed over in the report

### Changed
- `dep-upgrade-check`: a zero-hit code-graph query is confirmed with one text search before an entry is marked not affected
- `dep-upgrade-check`: anything that downloads and executes third-party code (installs, `docker pull`/`run`, binaries) is offered, not run; `ecosystems.md` gains container image and GitHub Actions rows
- `dep-upgrade-check`: applying the fixes for a PR input happens on the PR's head branch in a separate worktree, committed locally and pushed only on the user's go-ahead, with a warning that dependency bots drop foreign commits and the bot setting that removes the need
- `dep-upgrade-check`: a CI failure in a setup or post step after the test/build step succeeded is reported as runner infrastructure with a rerun suggestion, not as evidence about the upgrade
- `pr-open`: the report ends with a one-line suggestion of `/dev-kit:pr-shepherd`, never invoked
- `pr-open`: the body aims for about 250 words outside dependency and checklist sections, with 6–8 one-sentence change bullets at most and long logs in `<details>`; specs and ADRs the diff adds or commits name get a **Go deeper** link, also under a repository template
- `pr-open`: a branch behind its base is reported with the commit count and the `git merge-tree` conflict state and opened as is; the skill never merges, rebases or commits to sync it
- `pr-open`: for an existing PR it pushes and reports URL, base and push result; it rewrites the description only when the request asks, and otherwise offers it in one report line instead of asking
- `pr-open`: the existing-PR check runs before the base is chosen, the stacked-base scan skips the current branch, and a second open-PR parent the chosen base does not contain is named in the report and the body's dependency section
- `ci-fix`: `nothing-to-fix` also covers a cause already fixed on the branch head that no newer run will replace; `next` names the `workflow_dispatch` command, and a deploy workflow is never dispatched
- `ci-fix`: changing an assertion to match the documented contract is a fix whose commit quotes the contract line; accepting output the contract does not name is loosening, so `blocked` under `push-authorized`
- `ci-fix`: a flaky-test call needs a relatedness check against the branch diff; a test whose subject the branch touches is not flaky until it passes locally twice, and a rerun without a local run is reported as an unverified flake
- `ci-fix`: under `push-authorized` the result block is printed before control returns to the caller, even within the same turn
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
