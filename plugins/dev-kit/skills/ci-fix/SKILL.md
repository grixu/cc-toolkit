---
name: ci-fix
description: Fix a failed CI pipeline at its root cause, verify locally, and commit. Use when the user pastes a GitHub Actions run, job, PR or commit-checks URL, says CI, a pipeline or a build is red, or another skill hands over a failing check.
argument-hint: "[run/job/PR/commit URL | run ID | PR number] [push-authorized]"
allowed-tools: Read Edit Write Grep Glob Bash(gh run view *) Bash(gh run list *) Bash(gh run rerun *) Bash(gh pr checks *) Bash(gh pr checkout *) Bash(git status *) Bash(git fetch) Bash(git fetch *) Bash(git switch *) Bash(git log *) Bash(git diff *) Bash(git show *) Bash(git add *) Bash(git commit *) Bash(git push) Bash(git push *)
---

Target: **$ARGUMENTS**

## Invocation contract

- **Target**: a GitHub URL (run, job, PR, PR checks, commit, commit checks), a run ID, or a PR number. Empty means the current branch.
- **`push-authorized`**: when this literal token appears in the arguments, the caller has already been granted consent to push. Push without asking, and run *unattended*: wherever a step below says to ask the user, end with status `blocked` instead. `pr-shepherd` invokes this skill that way. Without the token, every push waits for the user's yes.
- Every run ends with the **result block** (last section), even an early stop.

## 1. Locate the failure

Resolve the target to a repository, one or more failed runs, and their failed jobs and steps:

| Target | Resolve with |
| --- | --- |
| `…/actions/runs/<run-id>` (optionally `/attempts/<n>`, `/job/<job-id>`) | `gh run view <run-id> -R OWNER/REPO --json workflowName,headBranch,headSha,event,attempt,conclusion,jobs,url` |
| `…/pull/<n>` or `…/pull/<n>/checks`, PR number | `gh pr checks <n> --json name,state,bucket,link,workflow`; take `bucket == "fail"`, the run ID sits in `link` |
| `…/commit/<sha>` or `…/commit/<sha>/checks` | `gh run list -R OWNER/REPO --commit <sha> --json databaseId,workflowName,conclusion,headBranch` |
| empty | `gh pr checks` for the current branch's PR; with no PR, `gh run list --branch <current> --json databaseId,workflowName,conclusion,headSha,createdAt` and keep the newest run per workflow |

A run superseded by a newer green run of the same workflow on the same branch is not a failure; drop it. Use a job's `databaseId` from `--json jobs` as its ID. A failing check with no Actions run behind it (a third-party app) has its details in `gh api repos/OWNER/REPO/commits/<sha>/check-runs` (`output`, `details_url`) and `gh api repos/OWNER/REPO/check-runs/<id>/annotations`.

When nothing is failing (all green, or still pending), end with status `nothing-to-fix`.

## 2. Guard the checkout

Fixing happens only in a local clone of the run's repository, on the run's `headBranch`:

- **Other repository** than the current clone: status `blocked`, naming the repository.
- **Other branch** than the checkout: ask the user whether to switch (`gh pr checkout <n>` or `git switch <branch>`; a dirty tree stays theirs to stash). Proceed only on the run's branch.
- **HEAD differs from the run's `headSha`**: the failure may already be gone. Check whether the failing code still exists on HEAD before fixing it.

## 3. Find the root cause

Read `gh run view <run-id> --log-failed` (add `--job <job-id>` per job) into a temp file and search it; failed logs can be huge. When it answers 403/404 or returns no logs (a fork's run, missing permission, expired logs), end with status `blocked` and ask the user for the log excerpt. A cause guessed from code alone is not a root cause.

Then read the failing step in the workflow YAML (its `run:`, `uses:`, versions, env, matrix entry) and the code the error points at. The root cause is found when you can name the change that made it fail (a commit, a dependency release, a runner image or action update) and explain why this check saw it. The first error line is often a symptom of an earlier one; follow it back.

Classify each failed job; jobs sharing one cause are one cause:

- **Code or config**: the repository is wrong. Fix it, in the code or in the workflow file, wherever the cause lives.
- **Dependency or upstream**: a floating version resolved to a breaking release, an action tag moved, a base image changed. Adapt the code to the new version, or pin the last good version when the release itself is broken; say which in the report.
- **Transient**: runner lost or out of disk, network timeout, registry 5xx, rate limit. Mark it for a *rerun*, which needs no consent and happens once per run: when `attempt` is already above 1 with the same failure, it is not transient. Status `rerun`.
- **Flaky test**: fails intermittently, passes locally, unrelated to the branch's changes. Mark it for a *rerun* as above and name the test in the report so the flake can be fixed on its own.
- **Environment**: missing secret, expired credential, required permission, disabled runner, billing. Status `not-fixable`, naming what an admin must change.

## 4. Fix and verify

Reproduce first: run the failing step's command locally, with the tool versions the workflow pins, and watch it go *red*. Fix the cause, then the same command goes *green*. Run the repository's lint and typecheck on the touched files too. When the step cannot run locally (services, secrets, another OS), say so in the report's `verified` field.

A fix makes the check pass on its merits. A test, lint rule or check that is removed, skipped, loosened, or given `continue-on-error` only moves the failure out of sight; when that is genuinely the right fix, ask the user first.

## 5. Commit and push

One commit per root cause, conventional commit style matching `git log`. Stage only the fix's files (`git add <paths>`); pre-existing changes in the tree are the user's and stay out.

Push to the run's branch with `git push`: at once under `push-authorized`, otherwise ask the user and push on their yes. Pushing a change under `.github/workflows/` needs a token with the `workflow` scope; when the push is refused for it, report `pushed: no` with that reason. Last, trigger each marked *rerun* with `gh run rerun <run-id> --failed`, unless a push to that branch just started fresh runs.

## Result block

End with this block, exactly these keys, each on one line:

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

With several causes, `cause` lists each one and `status` takes the first that applies in the order `blocked`, `not-fixable`, `fixed`, `rerun`, `nothing-to-fix`.
