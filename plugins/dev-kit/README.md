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

- A transient failure (lost runner, network timeout, rate limit) or a flaky test gets one rerun instead of a code change.
- An environment problem (missing secret, expired credential, permission, billing) is reported for an admin, not patched.
- It works only in a local clone of the failing repository, and asks before switching to the run's branch.
- It asks you before it skips, loosens or removes a check.

Output: a `ci-fix result` block with the status (`fixed`, `rerun`, `nothing-to-fix`, `not-fixable` or `blocked`), the cause, the commits, how the fix was verified, whether it was pushed, and what is left for you.

### pr-shepherd: drive a pull request to green

Use it when your branch has an open pull request and you want CI fixed and review comments handled without watching it.

```
/dev-kit:pr-shepherd
```

Running it authorizes commits and pushes to the pull request's branch. It starts a self-paced `/loop`, and each round does the following:

- It hands red checks to `ci-fix`, which may push without asking.
- It judges each open review comment on its merits. For a comment it agrees with, it makes the change, commits and pushes it, replies `Fixed in <sha>`, and resolves the thread.
- It answers a comment it disagrees with, or a question, with evidence and an @-mention of the author. It resolves bot threads after replying and leaves human threads for the reviewer to resolve.
- It waits 5 minutes while checks run, and 30, then 60 minutes while it waits for reviewers.

It never asks you anything mid-run. It stops and reports when any of these happens:

- Every check is green and no review thread is open (success).
- The branch has no open pull request, has merge conflicts, uncommitted changes or unpushed commits, or has diverged from the remote.
- `ci-fix` reports a failure it cannot fix, or the same check is red again after two fix attempts.
- CI is green and every remaining thread waits on a human who has not replied for 24 hours, already holds two of its rebuttals, or cannot be replied to.
- It has run 48 rounds.

Output: a final report listing the commits pushed, the threads fixed, answered or rebutted (with links), and everything left for you.

### dep-upgrade-check: will this upgrade break us?

Use it before you merge a dependency bump, including Renovate and Dependabot pull requests. Pass a package with a version, a package alone for its latest release, or a pull request URL:

```
/dev-kit:dep-upgrade-check vite@7
/dev-kit:dep-upgrade-check zod
/dev-kit:dep-upgrade-check https://github.com/owner/repo/pull/42
```

It starts from the version your lockfile resolves today and lists every change up to the target from release notes, changelogs, migration guides and package metadata (`exports`, `engines`, peer dependencies). It then checks each change against the places your code uses the package. It works with pnpm, npm, yarn, Python, Go, PHP and Rust projects. For a pull request, it also reads the pull request's CI result.

The check is read-only: it changes no manifest, lockfile or source file. When the result is not `safe`, or questions remain open, it offers to install and build the upgrade in a throwaway git worktree, and runs that build only if you agree.

Output: a verdict (`safe`, `safe with changes` or `breaking`), a table of affected changes with `file:line` locations and the fix for each, the open unknowns, and the sources it used. If you then ask it to apply the upgrade, it applies the fixes from the table and runs your checks.

### pr-open: push the branch and open a pull request

Use it when your commits are ready for review. Add `draft` for a draft pull request, and a branch name to set the base:

```
/dev-kit:pr-open
/dev-kit:pr-open draft develop
```

It pushes the current branch and fills the repository's pull request template. It looks for the template in the repository root, `docs/`, `.github/`, a `PULL_REQUEST_TEMPLATE/` directory, or the owner's `.github` repository, and uses a short default when none exists.

- Every claim in the description comes from the diff, the commits, a linked issue, or a command run in the session.
- It ticks a checkbox only when it has evidence that the item is true.
- It writes a Conventional Commits title when the base branch's history uses that style.
- It assigns the pull request to you.
- When your branch builds on another open pull request's branch, it targets that branch.
- When a pull request already exists, it pushes and offers to rewrite the description.

It never commits. It stops on the default branch or a detached HEAD, and asks what to do when there are uncommitted changes.

Output: the pull request URL, its base branch, the template it used, and the sections and checkboxes left for you to complete.

## Permissions

Each skill pre-approves only some of the commands it runs. Anything else asks for permission unless your settings already allow it:

| Skill | Pre-approved | Still asks |
|---|---|---|
| `ci-fix` | File edits; `git status`, `fetch`, `switch`, `log`, `diff`, `show`, `add`, `commit`, `push`; `gh run view`, `list`, `rerun`; `gh pr checks`, `checkout` | `gh api` (checks from third-party apps); your test, lint and build commands |
| `pr-shepherd` | File edits; `git status`, `fetch`, `rev-list`, `pull --ff-only`, `log`, `diff`, `add`, `commit`, `push`; `gh pr view`, `checks`, `comment`; `gh api graphql`; `ci-fix` | Your test and lint commands |
| `dep-upgrade-check` | `gh repo view`; `gh pr view`, `diff`, `checks`; `gh release list`, `view`; `pnpm view`, `why`, `list`; `npm diff`; firecrawl search and scrape; context7 | `gh api` (changelog files, commit ranges); lookups for npm, yarn, Python, Go, PHP and Rust; the optional worktree build |
| `pr-open` | Nothing | Every `git` and `gh` command |

An unattended `pr-shepherd` loop pauses at the first permission prompt. Before you start it, allow your repository's check commands in `.claude/settings.json`, for example `"Bash(pnpm test *)"`.

## Advanced

- `ci-fix` accepts the extra argument `push-authorized`. It then pushes without asking and ends with status `blocked` wherever it would otherwise ask you. `pr-shepherd` calls it this way.
- `pr-shepherd` accepts an `iteration` argument. The loop passes it; you do not need to.
- `skills/dep-upgrade-check/bot-prs.md` and `ecosystems.md` are reference files the skill reads, not commands.
