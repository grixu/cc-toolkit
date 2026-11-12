# Changelog

All notable changes to the **dev-kit** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `pr_risk`: Gemini Decision (`gemini-decision-1`) as a second backend beside TypeSafe Jev. New options `gemini_api_key` (falls back to `GEMINI_DECISIONS_API_KEY`, then `GEMINI_API_KEY`), `decision_backend` (`auto`, `typesafe`, `gemini`, `both`) and `primary_backend`, and a `backend` tool input. With both keys and `auto`, `pr-open` asks which to use. `both` runs the two side by side: the primary backend sets the level and label, `comparison` holds each backend's levels, the **Risk** section shows the other's level and whether it differs, and each pair is logged to `~/.cache/dev-kit/compare.jsonl`.
- `fe-eval.mjs --live --backend gemini` scores the cohort with Gemini Decision's answers.

### Changed

- Requires Claude Code v2.1.271 or later, for the fixed-choice options; the mod already needs v2.1.287.
- The risk label `pr-open` creates is described as "Pull request risk assessed by dev-kit pr_risk".

## [0.9.1] - 2026-11-12

### Fixed
- `pr_risk`: runs git in the repository even after the session changed into a directory outside it, such as the scratchpad, falling back to the directory the session started in; such a session no longer gets `Risk assessment unavailable: base branch "main" not found locally or on origin`, and a session outside any repository is told so

## [0.9.0] - 2026-11-12

### Added
- `pr-open`: reads the manifest the pr-proof plugin's skills write at `~/.cache/pr-proof/<repo>/<branch>/manifest.json` and adds a `## Proof` section just before `## Risk`: each entry's claim with its screenshots as a screen-by-width table, its video or image, or its terminal or API transcript as a code block (folded past 20 lines), a note when later commits changed the entry's files or history was rewritten since it was taken; media are attached with `gh --attach` and the body is re-read to confirm GitHub's `user-attachments` URLs replaced every `./` reference; past 50 media the rest go in marked `<!-- pr-proof:overflow -->` comments, which each run replaces; on an existing pull request the section is replaced, inserted or, for an empty manifest, removed; missing files and a manifest that does not parse or has an unknown `version` are named in the report; the section is outside the length budget

## [0.8.1] - 2026-11-10

### Fixed
- `pr_risk`: reads each file's diff from the repository root, also under a user's `diff.relative=true`, so a session that changed into a subdirectory no longer gets empty diffs and `Risk assessment unavailable: reduce of empty array with no initial value`; a change with no diff text is assessed as one even when the caller passed slices

## [0.8.0] - 2026-11-09

### Added
- Risk evaluator: evaluation-only `semantic-likelihood-v1` and `causal-impact-v1` prompt variants with strict variant validation
- Risk evaluator: full-denominator accuracy, Wilson intervals, failure/incomplete counts, confusion matrix, per-class metrics, experiment completeness and request provenance; strict replay with explicit legacy compatibility flags
- `pr_risk`: bounded execution excerpts verified against committed source, optional atomic-question experiments with explicit unknown/missing answers, and separately selectable risk policies
- `pr_risk`: assesses the change per vertical slice, a group of files that serves one purpose; it takes the slices from an optional `slices` input, or has Claude Haiku group the files from their paths and hunk headers, or falls back to splitting by size; the result gains `slices` (title, files, level, impact, likelihood, intents, types and flags of each) and `slicing` (where the grouping came from)
- `pr_risk`: 31 change types asked as Jev yes/no questions per slice: 24 risk signals that count when present (such as a schema migration, data deleted, rewritten or expired by a job, endpoint or infrastructure definition, a change to when or to whom the system issues invoices, payments or customer messages, data access, authorization, an API contract change, a feature flag check, CI, an infrastructure change whose correctness depends on live state, UI components, a dependency update, a kind of test, or a change that reaches only the team's local setup, agent rules or alerts) and 7 that count when much of the slice is about them (such as observability, error handling or documentation); a slice made only of prose takes no risk signal; the result gains `types`
- `pr_risk`: an optional `context` input, the pull request's and ticket's title and description; a second request per slice sends it with the commits and each file's git status and line counts, no content, and asks what the slice does: new functionality, a behavior change, a change to when a behavior applies, a bug fix, a refactor, a rename or move, or a code removal; the result gains `intents`
- `pr_risk`: risk promotions use each request's own signals; team-only reductions require complete coverage, agreement across all parts and no contradictory signals. Feature flags no longer lower impact merely because they exist; the default `calibrated-v1` policy retains measured UI/rename heuristics with hazard checks, while opt-in `evidence-v1` removes them
- `pr_risk`: an optional `testing_policy` input, the repository's testing rules in a few sentences; a slice flagged as logic without tests is checked against it in one more request with no file content, and the flag is dropped when the policy expects no test there; `pr-open` reads the rules from `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING` and CI
- `pr-open`: passes `slices` and `context` (the linked issue, read when a tool for its tracker is available, and the why of the change) to `pr_risk`, and the **Risk** section gains a table with each slice's level, impact, complexity, manual evidence (needed, provided or missing, and any test gap), what it does and change types, and lists the rules that adjusted a level
- An eval of `pr_risk` against labelled pull requests on the real TypeSafe API (`evals/pr-risk/`), with a mode that scores the change types and intents against labelled slices; cases from private repositories live in a git-ignored `local/` folder
- Factor scorer evals: `data.mjs` pulls the private labelled cohorts from a Cloudflare R2 bucket and verifies their hashes; `fe-eval.mjs` replays the recorded factor answers through production code and fails unless states, request bodies and cost match the cohort, or sends the same states to Jev live to show drift; `e2e.mjs` runs the real `pr-open` in a sandbox per labelled PR and scores its `pr_risk` level

### Changed
- `pr_risk`: mark partial assessments as low confidence when request limits omit files or size limits truncate hunks; retain the model confidence value and coverage details.
- `pr_risk`: a prose file (other than agent instructions) or a data file under a test path is cut to one request's worth when read, so a long spec or recorded fixture no longer pushes code past the request cap; a cut in such a file is still counted in `coverage.truncatedHunks` but no longer makes the assessment partial or low confidence
- `pr_risk`: in the default `calibrated-v1` policy, a slice made only of prose (Markdown, text, diagram sources, changesets; agent instruction files excepted) is capped at minor impact and simple likelihood, so a spec or ADR is no longer rated by the system it describes; `evidence-v1` is unchanged
- `pr_risk`: in the default `calibrated-v1` policy, a slice whose dependency manifest (`package.json`, Terraform providers and lock file, `go.mod`, `requirements*.txt`, `pyproject.toml`, Helm `Chart.yaml`) moves a runtime dependency to a new major version gets at least non-trivial likelihood, since the breaking changes lie outside the diff; dev dependencies and `evidence-v1` are unaffected. An offline replay of the 253 V5 cases moves two cases from medium to high, matching their labels, and none the wrong way; expected cost (under-estimates ×2) falls from 0.518 to 0.507
- `pr_risk`: restore the default team-only impact cap for data and state-dependent infrastructure changes. Retain complete coverage, all-part agreement, raw severe-median and security/external-effect guards; other reductions and `evidence-v1` stay unchanged. Local-state recoverability is not distinguished. Offline fixed-mask agreement improves from 76/75 to 78/77 raw matches and 73/73 to 73/74 completed matches out of 94 in A/C, with no new dangerous underestimates.
- `pr_risk`: default Jev version pinned to `jev-1.14.0`; generated prior Risk reports are removed from intent context; changes with no reviewable text are unavailable instead of receiving a synthetic assessment
- `pr_risk`: the level comes from Jev's factor answers per slice: the impact of a mistake (five levels, none to severe) and the change's complexity (five levels, plain edits to ordering or shared state, read as four likelihood levels), combined by a fixed matrix; a severe impact anywhere with non-trivial logic anywhere is critical. Each factor request is sent twice and the probabilities averaged, and each level is the median of Jev's per-level probabilities, so an answer split between a harmless and a severe outcome is not averaged into a level between them. A slice of at most feature impact whose manual evidence (screenshots, a video, an API request and response) the PR description carries gets its likelihood lowered one step, unless it changes behaviour without a test where one could be written. The result gives `scorer`, `impact`, `likelihood`, `complexity` and `evidence`, per slice also `testGap`, and loses `score` and `signals`. A slice without factor answers keeps its diff request's level as a floor for the change, makes the assessment partial and is counted in `coverage.factorsMissing`; when no slice has them, the diff request's impact and likelihood set the level (`scorer: "two-axis fallback"`). A slice takes up to four more Jev requests
- `pr_risk`: flags are read from the change types instead of being asked; **Hard to reverse** is gone, as that outcome is now the severe impact level, and **Changes CI, build or deployment** becomes **Changes CI, infrastructure or deployment**; **Logic without tests** is raised for a slice that holds code, whose intent adds, changes or fixes behavior, with no test type and no test file; test files include mocks, fixtures, stories and Cypress or Playwright folders, the same set the factor scorer's test gap reads
- `risk_levels` takes exactly four names; other counts fall back to `low`, `medium`, `high`, `critical`
- `pr_risk`: a diff request holds only its slice's file list and diff, without the commits and diffstat of the whole change, and the questions name the `diff` field
- `pr_risk`: requests run 4 at a time and retry a rate limit or server error up to 3 times
- `pr_risk`: a request Jev refuses as over its context limit is split in two at file and hunk boundaries and sent again, up to three times over, and a large change may take up to 32 requests instead of 8

## [0.7.0] - 2026-11-02

### Changed
- `pr-open`: the description is short and reviewer-first. One to three plain sentences and a **Before / After** table replace the bold lead line, **Why it matters** and the bullet list. **Testing:** says what was not checked, **Reviewer notes:** appears only when something needs a hard look, and **Go deeper:** stays. The body fits on one screen (about 40 non-blank lines) and stays valid MDX
- `pr-open`: a ticket field gets the key or `None`, never a partial placeholder. A dependency section lists the deploy steps found in the diff (migrations, infrastructure code, env vars and secrets, permission and policy changes, identity-provider configuration, feature flags, other repositories' pull requests), or `- None`. Untouched sections get `None` instead of `N/A`
- `pr-open`: checks the user reports count as testing evidence, credited to them, and work the base already has from a squash merge is left out
- `pr-open`: the title ends with the ticket key in parentheses when the base branch's history does that

### Fixed
- `pr-open`: rewriting an existing description edits the current body, keeping the author's sentences, bot lines, sections outside the template and the link reference definitions at the end, such as a Jira link line
- `pr-open`: refreshing the **Risk** section no longer deletes everything after it; the link reference definitions that end a body stay below it

## [0.6.0] - 2026-11-02

### Changed
- `dep-upgrade-check`: the release-age cooldown comes from the repository's own configuration, read from the base branch for a pull request. Sources: Renovate `minimumReleaseAge` (top level and matching `packageRules`), Dependabot `cooldown` (3 days without one), or pnpm `minimumReleaseAge`. 7 days applies only when none is set. The report names the value and its source, and the `blocked` reason, the acceptable-from date and the minimum safe version use it
- README: the reference CI job grants `pull-requests: write`, and the security notes say to keep **Allow GitHub Actions to create and approve pull requests** off

### Fixed
- `dep-upgrade-check`: no longer claims that `issues: write` with `pull-requests: read` can comment on a pull request; GitHub answers 403, and the result block's `reason` now names the missing `pull-requests: write`

## [0.5.0] - 2026-10-28

### Fixed
- `dep-upgrade-check`: a re-run that carries a maintainer's decision reports the decision itself in the result block's `decision` (no more `carried`), and the new `decision_carried: true | false` says where it came from, so a CI gate can pass a carried acceptance and fail a carried hold

### Changed
- `dep-upgrade-check`: PR comments are created with the REST issue-comments endpoint, which a token with `issues: write` and only `pull-requests: read` can use; `gh pr comment` is no longer pre-approved
- README: the reference CI job fails unless the result block reads `status: done`, `security` `clear` or `escalated`, and `decision` `accepted` or `n/a`
- README: the reference CI job grants `issues: write` and keeps `pull-requests: read`, runs with `--strict-mcp-config --setting-sources user`, skips Renovate's lockfile-maintenance pull request, and explains required status checks and `CLAUDE_CODE_OAUTH_TOKEN`

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
