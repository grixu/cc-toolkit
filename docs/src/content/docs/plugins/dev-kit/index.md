---
title: dev-kit
description: Four everyday skills for GitHub repositories that fix failed CI, shepherd pull requests, check dependency upgrades, and open pull requests.
---

dev-kit takes over four chores that interrupt work on a GitHub repository. It fixes a red CI run, drives a pull request until it's green, checks a dependency upgrade, and opens a pull request. Each skill does the whole job, including commits and pushes where you allow them, and ends with a short report.

## Install

```
/plugin install dev-kit@cc-toolkit
```

dev-kit needs git and the GitHub CLI (`gh`), logged in with access to the repository.

## What it does

| Command or skill | What it does |
|---|---|
| `/dev-kit:ci-fix` | Finds the root cause of a failed GitHub Actions run, reproduces and fixes it locally, and commits one fix per cause. Asks before pushing. |
| `/dev-kit:pr-shepherd` | Runs a self-paced `/loop` that hands red checks to `ci-fix`, handles review comments, and pushes until CI is green and threads are resolved. |
| `/dev-kit:dep-upgrade-check` | Checks a dependency upgrade's security record, then maps every change up to the target to your code. Returns `safe`, `safe with changes`, or `breaking`. |
| `/dev-kit:pr-open` | Pushes the current branch and opens a pull request whose description fills the repository's template from the diff and commits. |

Each skill also starts on its own when you describe the task, for example "CI is red on this PR" or "will bumping vite to 7 break us?"

### Risk assessment

With a [TypeSafe](https://docs.typesafe.ai/introduction) API key configured, `pr-open` assesses the branch's risk, adds a **Risk** section, and labels the pull request with the level. The diff, the commit messages, and the pull request and ticket descriptions leave your machine. Without a key, nothing is sent. [Risk assessment](/plugins/dev-kit/risk-assessment/) covers how it works and how to set the key.

## Usage

- Fix the failed run behind a URL, a pull request number, or the current branch:

  ```
  /dev-kit:ci-fix https://github.com/owner/repo/actions/runs/123456
  /dev-kit:ci-fix 42
  /dev-kit:ci-fix
  ```

- Drive the current branch's pull request to green, or a stack of pull requests by number:

  ```
  /dev-kit:pr-shepherd
  /dev-kit:pr-shepherd 101 102 103
  ```

- Check an upgrade before you merge it. Pass a package with a version, a package alone for its latest release, or a pull request URL:

  ```
  /dev-kit:dep-upgrade-check vite@7
  /dev-kit:dep-upgrade-check https://github.com/owner/repo/pull/42
  ```

- Open a pull request. Add `draft` for a draft, and a branch name to set the base:

  ```
  /dev-kit:pr-open
  /dev-kit:pr-open draft develop
  ```

## Options

| Option | What it does |
|---|---|
| `push-authorized` (`ci-fix`) | Pushes without asking, and ends with status `blocked` wherever it would otherwise ask you. `pr-shepherd` calls `ci-fix` this way. |
| `unattended` (`dep-upgrade-check`) | Asks nothing, stops with status `stopped` wherever it would ask, and posts its full report on the pull request. `GITHUB_ACTIONS=true` has the same effect. |

The [plugin README](https://github.com/grixu/cc-toolkit/blob/main/plugins/dev-kit/README.md) has every option, the permissions each skill pre-approves, and a reference CI job for `dep-upgrade-check`.
