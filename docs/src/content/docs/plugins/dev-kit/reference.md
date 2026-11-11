---
title: Reference
description: The arguments of each dev-kit skill, the commands each one runs without asking, and the result blocks a caller or a script can read.
group: reference
sidebar:
  order: 10
---

This page lists the arguments, the pre-approved commands and the result blocks of the dev-kit skills.
The risk label's options, tool inputs and result fields are on [Risk label reference](/plugins/dev-kit/risk-assessment/reference/).

## Arguments

| Skill | Arguments |
|---|---|
| `/dev-kit:pr-open` | `[draft] [base branch]` |
| `/dev-kit:pr-shepherd` | `[PR …] [iteration]` |
| `/dev-kit:ci-fix` | `[run/job/PR/commit URL \| run ID \| PR number] [push-authorized] [checkout=<dir>]` |
| `/dev-kit:dep-upgrade-check` | `<package>[@<version>] \| <pull request URL> [unattended]` |

Table 1. Skill arguments

- **`draft`** (`pr-open`) opens a draft pull request. A branch name after it sets the base.
- **`iteration`** (`pr-shepherd`) marks one round of the loop. The loop passes it; you don't need to.
- **`push-authorized`** (`ci-fix`) pushes without asking, and ends with status `blocked` wherever `ci-fix` would otherwise ask you. `pr-shepherd` calls `ci-fix` this way.
- **`checkout=<dir>`** (`ci-fix`) names the local checkout to fix in, when the caller works in a worktree on the run's branch.
- **`unattended`** (`dep-upgrade-check`) asks nothing, ends with status `stopped` wherever the check would otherwise ask you, and posts its full report on the pull request. `GITHUB_ACTIONS=true` has the same effect.

## Permissions

Each skill pre-approves only some of the commands it runs.
Anything else asks for permission unless your settings already allow it.

| Skill | Pre-approved | Still asks |
|---|---|---|
| `pr-open` | Nothing | Every `git` and `gh` command |
| `pr-shepherd` | File edits; `git status`, `fetch`, `rev-list`, `pull --ff-only`, `log`, `diff`, `merge-tree`, `merge`, `worktree`, `add`, `commit`, `push`; `gh pr view`, `checks`, `comment`; `gh api graphql`; `ci-fix` | Your test and lint commands |
| `ci-fix` | File edits; `git status`, `fetch`, `switch`, `log`, `diff`, `show`, `add`, `commit`, `push`; `gh run view`, `list`, `rerun`; `gh pr checks`, `checkout` | `gh api` (checks from third-party apps); your test, lint and build commands |
| `dep-upgrade-check` | Writing files (the advisory query and the comment bodies); `printenv GITHUB_ACTIONS`; `git fetch`, `show`; `gh repo view`; `gh pr view`, `diff`, `checks`; `gh run view`; `gh api`, writes included; `gh release list`, `view`; `pnpm view`, `why`, `list`; `npm diff`; `curl -s` to api.osv.dev and api.deps.dev; WebFetch; firecrawl search and scrape; context7 | Lookups for npm, yarn, Python, Go, PHP, Rust, container images and GitHub Actions; the optional worktree build |

Table 2. Commands each skill runs without asking

An unattended `pr-shepherd` loop pauses at the first permission prompt.
Before you start it, allow your repository's check commands in `.claude/settings.json`, for example `"Bash(pnpm test *)"`.

## ci-fix result

Every `ci-fix` run ends with this block, an early stop too:

```
ci-fix result
status: fixed | rerun | nothing-to-fix | not-fixable | blocked
runs: <run URL>, ...
cause: <job / step: why it failed>; ...
commits: <short SHA> <subject>, ... | none
verified: locally | not reproducible locally: <why> | n/a
pushed: yes | no: <why> | n/a
next: <what the user or caller must do, or none>
```

With several causes, `cause` lists each one, and `status` takes the first that applies in the order `blocked`, `not-fixable`, `fixed`, `rerun`, `nothing-to-fix`.

## dep-upgrade-check result

Every `dep-upgrade-check` run ends with this block, an early stop too:

````
```dep-upgrade-check-result
status: done | stopped
security: clear | escalated | blocked | n/a
verdict: safe | safe with changes | breaking | not assessed | n/a
provisional: true | false
decision: accepted | switched | refresh | hold | pending | n/a
decision_carried: true | false
units: <count>
security_comment: <URL> | none
report_comment: <URL> | none
reason: <one line: why stopped, blocked or provisional> | none
```
````

- **`decision`** always holds the decision itself, also when it came from an earlier comment, and `n/a` when no upgrade is escalated.
- **`decision_carried`** is `true` when the decision came from an earlier comment.
- **With several upgrades**, `security` and `verdict` take the worst value, and `decision` the first value any escalated upgrade holds in the order `pending`, `hold`, `switched`, `refresh`, `accepted`.

A CI gate passes on `status: done`, `security` `clear` or `escalated`, and `decision` `accepted` or `n/a`.

## Reference files

`skills/dep-upgrade-check/` holds files the skill reads, not commands:

- `security.md`: the advisory lookups and the security comment.
- `cooldown.md`: how the release-age cooldown is read from Renovate, Dependabot and pnpm.
- `ecosystems.md`: the commands for each ecosystem other than pnpm.
- `bot-prs.md`: how the upgrades are read from a Renovate or Dependabot pull request.
