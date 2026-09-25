# dev-kit

Small skills for everyday development work. Each one can be invoked by you (`/dev-kit:<skill>`) or picked up by Claude on its own when a request matches.

## Installation

```
/plugin marketplace add grixu/cc-toolkit
/plugin install dev-kit@cc-toolkit
```

## Skills

### `ci-fix`

Paste a failed run, job, PR or commit-checks URL (or nothing, for the current branch). Finds the workflow and failing step, traces the root cause, fixes it, verifies locally and commits one commit per cause. Asks before pushing. Transient and flaky failures get a single rerun; environment problems (secrets, permissions) are reported, not patched.

```
/dev-kit:ci-fix https://github.com/owner/repo/actions/runs/123456
```

### `pr-shepherd`

Drives the current branch's pull request to green in a self-paced `/loop`. Each iteration: red CI goes to `ci-fix` (push authorized), justified review comments are fixed, committed, pushed and resolved, unjustified ones get an in-thread reply mentioning the author. Stops when every check is green and no review thread is open, or hands over to you when it needs a human (conflicts, dirty tree, repeated failures, quiet reviewers).

```
/dev-kit:pr-shepherd
```

`pr-shepherd` and `ci-fix` pre-approve the `git` and `gh` commands they run, so an unattended loop does not stop on those prompts. The commands that reproduce a failure or verify a fix (tests, lint, build) differ per repository and cannot be pre-approved by the plugin: allow them in the project's `.claude/settings.json` (for example `"Bash(pnpm test *)"`), or the loop pauses at the first such prompt.

### `dep-upgrade-check`

Checks whether upgrading a dependency breaks the codebase. Takes a package and target version, or a Renovate/Dependabot PR link. Builds a ledger of every change between the resolved and target version (release notes, migration guides, metadata such as `exports`, `engines`, peers) and maps it to actual usage. Returns **safe / safe with changes / breaking** with a file:line table. Read-only; a local build in a throwaway worktree is offered, not run.

```
/dev-kit:dep-upgrade-check vite@7
/dev-kit:dep-upgrade-check https://github.com/owner/repo/pull/42
```

### `pr-open`

Pushes the current branch and opens a pull request. Finds the repository's PR template (root, `docs/`, `.github/`, `PULL_REQUEST_TEMPLATE/`, or the owner's `.github` repo), keeps its structure, and fills it in plain, bulleted Smart Brevity style backed by the diff and commits. Ticks checkboxes only on evidence. With an existing PR, offers to refresh its description.

```
/dev-kit:pr-open
/dev-kit:pr-open draft develop
```
