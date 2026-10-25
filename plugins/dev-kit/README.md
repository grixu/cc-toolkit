# dev-kit

dev-kit takes over four chores that interrupt work on a GitHub repository: fixing a red CI run, driving a pull request through review until it is green, checking whether a dependency upgrade breaks your code, and opening a pull request with a filled-in description. Each skill does the whole job, including commits and pushes where you allow them, and ends with a short report.

## Install

dev-kit is a Claude Code plugin. Add the `cc-toolkit` marketplace once, then install the plugin:

```
/plugin marketplace add grixu/cc-toolkit
/plugin install dev-kit@cc-toolkit
```

## Requirements

- The GitHub CLI `gh`, logged in (`gh auth status`) with access to the repository. Every skill calls it.
- A GitHub repository. `ci-fix` and `pr-shepherd` handle GitHub Actions runs and GitHub check runs only.
- To push a fix to a file under `.github/workflows/`, a token with the `workflow` scope.
- For `pr-shepherd`: Claude Code's built-in `/loop`. Without it, `pr-shepherd` runs one round and tells you the loop could not start.
- Optional, for `dep-upgrade-check`: the firecrawl and context7 MCP servers, which it uses to find migration guides. Without them it still reads GitHub releases and changelogs, and reports a guide it could not find as `no guide found`.
- Optional, for the risk assessment in `pr-open`: a [TypeSafe](https://docs.typesafe.ai/introduction) API key and Claude Code v2.1.287 or later, which loads the plugin's mod. See [Risk assessment](#risk-assessment-typesafe-jev).

## Skills

Run a skill with `/dev-kit:<skill>`, or describe the task ("CI is red on this PR", "will bumping vite to 7 break us?") and Claude picks the matching skill.

### ci-fix: fix a failed CI run

Use it when a GitHub Actions run, job or check has failed. Pass a run, job, PR or commit URL, a run ID, a PR number, or nothing for the current branch:

```
/dev-kit:ci-fix https://github.com/owner/repo/actions/runs/123456
/dev-kit:ci-fix 42
/dev-kit:ci-fix
```

It reads the failed logs and the workflow file, finds the change that caused the failure, reproduces it locally, fixes it, and runs the same command again to confirm the fix. It makes one commit per root cause and asks before pushing.

- A transient failure (lost runner, network timeout, rate limit) or a flaky test gets one rerun instead of a code change. A test whose subject the branch changes counts as flaky only after it passes locally twice; a rerun without a local run is reported as an unverified flake.
- An environment problem (missing secret, expired credential, permission, billing) is reported for an admin, not patched.
- It works only in a local clone of the failing repository, and asks before switching to the run's branch.
- It asks you before it skips, loosens or removes a check. Aligning an assertion with a documented contract is a fix, and the commit quotes the contract line.
- It never merges or rebases the base into the branch, resolves conflicts, force-pushes or edits the pull request unless you name that action.

When the cause is already fixed on the branch but no new run will come (a path filter, a deploy workflow), it reports `nothing-to-fix` and names the `gh workflow run` command for you; it never dispatches a deploy itself.

Output: a `ci-fix result` block with the status (`fixed`, `rerun`, `nothing-to-fix`, `not-fixable` or `blocked`), the cause, the commits, how the fix was verified, whether it was pushed, and what is left for you.

### pr-shepherd: drive a pull request to green

Use it when your branch has an open pull request and you want CI fixed and review comments handled without watching it. Pass several pull request numbers to shepherd a stack:

```
/dev-kit:pr-shepherd
/dev-kit:pr-shepherd 101 102 103
```

Running it authorizes commits and pushes to the pull request's branch, and counts as the per-branch push consent a repository rule reserving `git push` for humans asks for. Outside the stack merges below, it never merges or rebases the base into the branch, resolves conflicts, force-pushes, or closes, reopens or edits the pull request unless a later message of yours names that action. It starts a self-paced `/loop`, and each round does the following:

- It hands every red check to `ci-fix`, which may push without asking; it never fixes or reruns CI itself. A red check that is not required gets one `ci-fix` run; if it stays red, the report lists it for you instead of holding the loop.
- It judges each open review comment on its merits. For a comment it agrees with, it makes the change, commits and pushes it, replies `Fixed in <sha>`, and resolves the thread.
- It answers a comment it disagrees with, or a question, with evidence and an @-mention of the author. It resolves bot threads after replying and leaves human threads for the reviewer to resolve.
- A comment whose fix is a trade-off only you can make (security posture, scope) gets one reply listing the options and their cost; the thread stays open for you, and the report lists it.
- In a stack, each pull request gets its own worktree. A fix lands on the lowest branch that owns the code and reaches the branches above it by a plain merge of each base into its child, never a rebase; it never merges the default branch in.
- It waits 5 minutes while checks run, and 30, then 60 minutes while it waits for reviewers.

It never asks you anything mid-run. It stops and reports when any of these happens:

- Every required check is green and no review thread is open (success).
- The branch has no open pull request, uncommitted changes to tracked files or unpushed commits, or has diverged from the remote.
- GitHub reports the pull request as conflicting. It still handles the review threads and pushes, then stops and names the conflicting files; it never resolves the conflict, and running it again before you do stops the same way.
- `ci-fix` reports a failure it cannot fix, or the same check is red again after two fix or rerun cycles, whichever step made them.
- Every required check is green and every remaining thread waits on a human who has not replied for 24 hours, already holds two of its rebuttals or its reply on a decision, or cannot be replied to.
- It has run 48 rounds.

Output: a final report listing the commits pushed, the threads fixed, answered or rebutted (with links), and everything left for you.

### dep-upgrade-check: will this upgrade break us?

Use it before you merge a dependency bump, including Renovate and Dependabot pull requests. Pass a package with a version, a package alone for its latest release, or a pull request URL:

```
/dev-kit:dep-upgrade-check vite@7
/dev-kit:dep-upgrade-check zod
/dev-kit:dep-upgrade-check https://github.com/owner/repo/pull/42
```

It starts from the version your lockfile resolves today and lists every change up to the target from release notes, changelogs, migration guides and package metadata (`exports`, `engines`, peer dependencies). For a pull request, it also checks whether the lockfile now holds old and new copies of the package side by side. It then checks each change against the places your code uses the package. It works with pnpm, npm, yarn, Python, Go, PHP and Rust projects, container images and GitHub Actions. For a pull request, it also reads the pull request's CI result; a runner failure in a setup or cleanup step after the tests passed counts as neither for nor against the upgrade, and it suggests a rerun.

The check is read-only: it changes no manifest, lockfile or source file. When the result is not `safe`, or questions remain open, it offers to install and build the upgrade in a throwaway git worktree, and runs that build only if you agree. Anything else that downloads and runs third-party code, such as pulling and running a container image, is offered the same way.

Output: a verdict (`safe`, `safe with changes` or `breaking`; marked `provisional`, at the worst value still possible, while an open question could change it), a table of affected changes with `file:line` locations and the fix for each, the open unknowns, and the sources it used. If you then ask it to apply the upgrade, it applies the fixes from the table and runs your checks: in your working tree for a package and version, or for a pull request on its branch in a separate worktree, committed locally and pushed only when you say so. It warns that Renovate and Dependabot drop commits that are not theirs when they rebase, and names the bot setting that would make the commit unnecessary.

### pr-open: push the branch and open a pull request

Use it when your commits are ready for review. Add `draft` for a draft pull request, and a branch name to set the base:

```
/dev-kit:pr-open
/dev-kit:pr-open draft develop
```

It pushes the current branch and fills the repository's pull request template. It looks for the template in the repository root, `docs/`, `.github/`, a `PULL_REQUEST_TEMPLATE/` directory, or the owner's `.github` repository, and uses a short default when none exists.

- Every claim in the description comes from the diff, the commits, a linked issue, or a command run in the session.
- The description stays around 250 words, with long logs folded into a `<details>` block, and links the specs and ADRs the branch adds or its commits name under **Go deeper**.
- It ticks a checkbox only when it has evidence that the item is true.
- It writes a Conventional Commits title when the base branch's history uses that style.
- It assigns the pull request to you.
- When your branch builds on another open pull request's branch, it targets that branch. When it also carries a second open pull request's commits that the target does not contain, the report and the description name that pull request and say its commits show in the diff until it merges.
- When a pull request already exists, it pushes and reports the pull request. It rewrites the description only when you ask for that, and otherwise mentions the option in one line.
- With a TypeSafe key configured, it assesses the branch's risk, ends the description with a **Risk** section, and labels the pull request with the level, such as `risk: high`. On an existing pull request it swaps the old risk label for the new one. Without a key, nothing is sent and the report says the risk was not assessed.

When the base has moved ahead, it reports how far behind the branch is and whether a merge would conflict, opens the pull request as it stands, and offers the sync as a separate step. It never commits, merges, rebases or force-pushes, and running it counts as the per-branch push consent a repository rule may require. It stops on the default branch or a detached HEAD, and asks what to do when tracked files have uncommitted changes; untracked files stay out of the pull request and are listed in the report.

Output: the pull request URL, its base branch, the template it used, the sections and checkboxes left for you to complete, the risk level and label (or why it was not assessed), and a one-line suggestion to run `pr-shepherd` next.

## Risk assessment (TypeSafe Jev)

dev-kit includes a mod that gives Claude the `pr_risk` tool (`mcp__dev-kit__pr_risk`). It sends the commits, the diffstat and the diff of `<base>...HEAD` to [TypeSafe's Jev model](https://docs.typesafe.ai/introduction) and returns a risk level, the model's confidence, and risk flags: security, persisted data, public contracts, CI and deployment, hard-to-reverse operations, and logic without tests. `pr-open` calls it; Claude can also call it when you ask how risky a branch is. There is no slash command.

**The diff leaves your machine.** The tool exists only when a key is configured, so without one nothing is sent.

Set the key in one of two ways:

- Export `TYPESAFE_API_KEY` in the shell you start Claude Code from (the default).
- Or enter it as the plugin's **TypeSafe API key** option, which Claude Code keeps in your system's credential store. It takes precedence over the variable.

Open the options with `/plugin configure dev-kit@cc-toolkit`:

| Option | Default | What it does |
|---|---|---|
| `typesafe_api_key` | empty, reads `TYPESAFE_API_KEY` | The API key |
| `typesafe_endpoint` | `https://api.typesafe.ai` | Base URL of the API; `/v1/systemone` is appended |
| `typesafe_model` | `jev-latest` | Model name or alias; pin a version such as `jev-1.14.0` to keep levels stable across Jev releases |
| `risk_label` | `true` | Whether `pr-open` labels the pull request |
| `risk_label_name` | `risk: {level}` | The label name; `{level}` becomes the level |
| `risk_levels` | `low`, `medium`, `high`, `critical` | Level names from lowest to highest, 2 to 5 of them; the model rates the change on exactly these levels, and with fewer than 5 each level covers several of the built-in descriptions |

`pr-open` creates a missing label once and never changes an existing one. A key set or changed during a session takes effect after `/reload-plugins`.

Large diffs are compacted and split. Lockfiles, binaries, minified, generated and build output files are left out of the diff but stay in the diffstat, and context lines are cut to one. When the rest exceeds what Jev reads in one request, it is split by file, and a large file by hunk, into up to 8 requests. The riskiest part sets the level, and a flag raised by any part counts. Anything beyond 8 requests is not assessed, and the **Risk** section says so.

## Permissions

Each skill pre-approves only some of the commands it runs. Anything else asks for permission unless your settings already allow it:

| Skill | Pre-approved | Still asks |
|---|---|---|
| `ci-fix` | File edits; `git status`, `fetch`, `switch`, `log`, `diff`, `show`, `add`, `commit`, `push`; `gh run view`, `list`, `rerun`; `gh pr checks`, `checkout` | `gh api` (checks from third-party apps); your test, lint and build commands |
| `pr-shepherd` | File edits; `git status`, `fetch`, `rev-list`, `pull --ff-only`, `log`, `diff`, `merge-tree`, `merge`, `worktree`, `add`, `commit`, `push`; `gh pr view`, `checks`, `comment`; `gh api graphql`; `ci-fix` | Your test and lint commands |
| `dep-upgrade-check` | `gh repo view`; `gh pr view`, `diff`, `checks`; `gh release list`, `view`; `pnpm view`, `why`, `list`; `npm diff`; firecrawl search and scrape; context7 | `gh api` (changelog files, commit ranges); lookups for npm, yarn, Python, Go, PHP, Rust, container images and GitHub Actions; the optional worktree build |
| `pr-open` | Nothing | Every `git` and `gh` command |

An unattended `pr-shepherd` loop pauses at the first permission prompt. Before you start it, allow your repository's check commands in `.claude/settings.json`, for example `"Bash(pnpm test *)"`.

## Advanced

- `ci-fix` accepts the extra argument `push-authorized`. It then pushes without asking and ends with status `blocked` wherever it would otherwise ask you. `pr-shepherd` calls it this way.
- `pr-shepherd` accepts an `iteration` argument after any pull request numbers. The loop passes it; you do not need to.
- `skills/dep-upgrade-check/bot-prs.md` and `ecosystems.md` are reference files the skill reads, not commands.
