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
