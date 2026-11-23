---
title: Reference
description: The arguments of each dev-kit skill, the commands each one runs without asking, and the result blocks a caller or a script can read.
group: reference
sidebar:
  order: 10
---

This page lists the arguments, the options, the pre-approved commands and the result blocks of the dev-kit skills.
The risk label's options, tool inputs and result fields are on [Risk label reference](/plugins/dev-kit/risk-assessment/reference/).

## Arguments

| Skill | Arguments |
|---|---|
| `/dev-kit:pr-open` | `[draft] [base branch]` |
| `/dev-kit:pr-shepherd` | `[PR …] [iteration]` |
| `/dev-kit:ci-fix` | `[run/job/PR/commit URL \| run ID \| PR number] [push-authorized] [checkout=<dir>]` |
| `/dev-kit:dep-upgrade-check` | `<package>[@<version>] \| <pull request URL> [unattended]` |
| `/dev-kit:merge-in-head` | `[base branch \| PR number]` |

Table 1. Skill arguments

- **`draft`** (`pr-open`) opens a draft pull request. A branch name after it sets the base.
- **`iteration`** (`pr-shepherd`) marks one round of the loop. The loop passes it; you don't need to.
- **`push-authorized`** (`ci-fix`) pushes without asking, and ends with status `blocked` wherever `ci-fix` would otherwise ask you. `pr-shepherd` calls `ci-fix` this way.
- **`checkout=<dir>`** (`ci-fix`) names the local checkout to fix in, when the caller works in a worktree on the run's branch.
- **`unattended`** (`dep-upgrade-check`) asks nothing, ends with status `stopped` wherever the check would otherwise ask you, and posts its full report on the pull request. `GITHUB_ACTIONS=true` has the same effect.
- **`base branch`** or **`PR number`** (`merge-in-head`) sets the base to merge. A pull request number takes that pull request's base and must be the current branch's pull request. Without either, the skill [finds the base itself](/plugins/dev-kit/merge-in-head/#how-it-finds-the-base).

## Plugin options

Set them with `/plugin configure dev-kit@cc-toolkit`.
These options shape `pr-open`'s code story and proof label, and whether `merge-in-head` pushes without asking; the API keys and the risk label's options are on [Risk label reference](/plugins/dev-kit/risk-assessment/reference/#plugin-options).

| Option | Default | What it does |
|---|---|---|
| `code_story` | `auto` | When `pr-open` writes a code story. `auto` asks a decision model whether the change is worth one and needs a TypeSafe or Gemini key; without one, the story is written. `always` writes one for every pull request, `never` writes none. |
| `story_gate_backend` | `auto` | Which model decides under `auto`. `auto` uses every backend whose key is set, `both` needs both keys, `typesafe` or `gemini` uses that one. |
| `proof_label` | `true` | Whether `pr-open` labels the pull request while its proof from pr-proof is current. |
| `proof_label_name` | `proof` | The name of that label. |
| `merge_auto_push` | `false` | Whether `merge-in-head` pushes the merge at once instead of asking first. |

Table 2. Code story, proof label and merge push options

[Whether a change gets a story](/plugins/dev-kit/pr-open/#whether-a-change-gets-a-story) and [the proof label](/plugins/dev-kit/pr-open/#the-proof-label) explain both in full.

## Permissions

Each skill pre-approves only some of the commands it runs.
Anything else asks for permission unless your settings already allow it.

| Skill | Pre-approved | Still asks |
|---|---|---|
| `pr-open` | Nothing | Every `git` and `gh` command |
| `pr-shepherd` | File edits; `git status`, `fetch`, `rev-list`, `pull --ff-only`, `log`, `diff`, `merge-tree`, `merge`, `worktree`, `add`, `commit`, `push`; `gh pr view`, `checks`, `comment`; `gh api graphql`; `ci-fix` | Your test and lint commands |
| `ci-fix` | File edits; `git status`, `fetch`, `switch`, `log`, `diff`, `show`, `add`, `commit`, `push`; `gh run view`, `list`, `rerun`; `gh pr checks`, `checkout` | `gh api` (checks from third-party apps); your test, lint and build commands |
| `dep-upgrade-check` | Writing files (the advisory query and the comment bodies); `printenv GITHUB_ACTIONS`; `git fetch`, `show`; `gh repo view`; `gh pr view`, `diff`, `checks`; `gh run view`; `gh api`, writes included; `gh release list`, `view`; `pnpm view`, `why`, `list`; `npm diff`; `curl -s` to api.osv.dev and api.deps.dev; WebFetch; firecrawl search and scrape; context7 | Lookups for npm, yarn, Python, Go, PHP, Rust, container images and GitHub Actions; the optional worktree build |
| `merge-in-head` | File edits; `git status`, `branch`, `config --get`, `reflog`, `remote`, `symbolic-ref`, `for-each-ref`, `rev-parse`, `rev-list`, `merge-base`, `fetch`, `merge`, `log`, `diff`, `show`, `blame`, `ls-files`, `add`, `commit`, `push`; `gh pr view`, `list`; `gh issue view` | Your typecheck, test and format commands |

Table 3. Commands each skill runs without asking

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

## merge-in-head result

Every `merge-in-head` run ends with this block, an early stop too:

```
merge-in-head result
status: merged | resolved | up-to-date | blocked
base: <ref> (<source: argument | pr #<n> | gh-merge-base | reflog | nearest | default | asked | in-progress merge>) | none: <why>
conflicts: <file: how it was resolved>; ... | none
checks: <command: pass | fail: why | not run: why>; ... | none found
commit: <short SHA> <subject>, ... (the merge first, then each fix) | none
pushed: yes | no: <why> | n/a
next: <what the user must do, or none>
```

`merged` is a clean merge, and `resolved` a merge whose conflicts the run resolved.
A check it couldn't run is `not run`, never a pass.

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
