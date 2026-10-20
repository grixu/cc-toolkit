---
name: pr-shepherd
description: Shepherd the current branch's pull request in a self-paced loop until CI is green and every review thread is resolved, fixing failures and review comments with commits and pushes, and answering the unjustified ones in-thread. Use when the user asks to babysit, watch or drive a PR to green, or to keep fixing CI and review comments until the PR is clean.
argument-hint: "[iteration]"
allowed-tools: Read Edit Write Grep Glob Bash(git status *) Bash(git fetch) Bash(git fetch *) Bash(git rev-list *) Bash(git pull --ff-only *) Bash(git log *) Bash(git diff *) Bash(git merge-tree *) Bash(git add *) Bash(git commit *) Bash(git push) Bash(git push *) Bash(gh pr view *) Bash(gh pr checks *) Bash(gh pr comment *) Bash(gh api graphql *) Skill(dev-kit:ci-fix *)
disallowed-tools: AskUserQuestion
---

Arguments: **$ARGUMENTS**

Invoking this skill authorizes every commit and push it describes, on the PR's branch only. It does not cover merging or rebasing the base into the branch, resolving conflicts, force-pushing, or changing the PR itself (close, reopen, base, title, body unless this skill's step says so); a later user message grants one of these only when it names it explicitly. This invocation is the explicit, per-branch consent that repository rules reserving `git push` for humans ask for; say so once in the first status line. It runs unattended: wherever it needs a human, it *stops* (below) with a report instead of asking.

## Entry

This skill body is one *iteration* of a self-paced `/loop`. When the arguments carry `iteration`, or this turn is already a `/loop` fire, run the iteration. Otherwise invoke the `loop` skill with the arguments `/dev-kit:pr-shepherd iteration` and end the turn: the loop runs the first iteration at once and paces the rest. When the `loop` skill is unavailable, run one iteration and tell the user the loop could not start.

Every iteration re-reads the whole state from git and GitHub; the transcript of earlier iterations counts only toward the caps.

To **stop**: call `ScheduleWakeup` with `stop: true` (on a fixed-interval loop, delete its job with `CronDelete` instead), then write the final report.

## 1. Read the state

1. `gh pr view --json number,url,state,headRefName,baseRefName,headRefOid,mergeable`. No PR for the current branch, or `state` is not `OPEN`: stop.
2. `git status --porcelain` and `git fetch`, then `git rev-list --left-right --count HEAD...origin/<headRefName>` (`@{u}` may be unset). A dirty tree, local commits ahead of the remote, or a diverged branch: stop, naming which; those changes are the user's. Untracked files (`??`) do not block, but are the user's: never stage them. Behind only: `git pull --ff-only origin <headRefName>`.
3. `mergeable == "CONFLICTING"`: trust GitHub. Never argue it away with a local merge check, and never close, reopen, retarget or edit the PR to make GitHub recompute; a stacked PR conflicts through its whole base chain down to the default branch. Skip step 2 (GitHub runs no `pull_request` CI on a conflicting PR), finish step 3 and push, then stop, naming the conflicting files (`git merge-tree --write-tree --name-only HEAD origin/<baseRefName>`, or the lower branch of the chain where the conflict sits) and saying that re-running before the conflict is resolved repeats this stop. Resolving it is the user's call. `UNKNOWN` is still computing and blocks nothing.
4. Checks: `gh pr checks --json name,bucket,state,link,workflow` for every check, and the same with `--required` for the required ones; when none is required, every check counts as required. `pass` and `skipping` (skipped, neutral) are green; `fail` and `cancel` are *red*; `pending`, or no checks reported yet for the head commit, is *pending*. A red non-required check is sent to ci-fix once; when it stays red after that, it goes under left-to-the-user in the report instead of blocking done.
5. Review threads, with `OWNER`/`REPO` filled by `gh` and `N` the PR number:

```bash
gh api graphql --paginate -F owner='{owner}' -F repo='{repo}' -F number=N -f query='
query($owner: String!, $repo: String!, $number: Int!, $endCursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 50, after: $endCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id isResolved isOutdated path line viewerCanReply viewerCanResolve
          comments(first: 100) {
            nodes { author { login __typename } viewerDidAuthor createdAt url body }
          }
        }
      }
    }
  }
}' --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved | not)'
```

Classify each unresolved thread by its last comment:

- **open**: the last comment is someone else's (`viewerDidAuthor` false). It needs handling this iteration.
- **awaiting**: the last comment is ours. It waits for the reviewer; when that comment reports a fix, resolve the thread now instead (a resolve that failed last time).

## 2. Fix red CI

Every red check goes through ci-fix; never fix or rerun CI directly in this skill. When a required check is red, or a red non-required one has not had its ci-fix run yet, invoke `dev-kit:ci-fix` with the arguments `<PR url> push-authorized`, and read its result block:

- `fixed` or `rerun`: CI restarts; continue.
- `nothing-to-fix`: the red check went green or pending meanwhile; continue.
- `not-fixable` or `blocked`: finish step 3, then stop with ci-fix's `cause` and `next`.

**Fix cap**: count every fix or rerun cycle on a check, whichever step made it (a ci-fix run reporting `fixed` or `rerun`, or a review fix aimed at that check). When the same check is red again after two such cycles, stop instead of invoking ci-fix a third time; the cycle needs a human.

## 3. Handle review

Take every *open* thread, reading the whole thread, the code at `path`/`line` on HEAD, and the PR's intent. Also read the `reviews` bodies and the PR conversation `comments`, trimmed to what judging needs:

```bash
gh pr view <N> --json comments,reviews --jq '{comments: [.comments[] | {author: .author.login, url, createdAt, body: .body[0:500]}], reviews: [.reviews[] | select(.body != "") | {author: .author.login, state, submittedAt, body: .body[0:500]}]}'
```

They have no resolution state, so they sit outside the exit condition, but a concrete change request in one that no later comment of ours links to is handled like a thread, answered once with `gh pr comment <N> --body` that links its URL (a review has none: name its author and `submittedAt`). Read a truncated body in full only when it holds such a request.

Judge each comment on its merits, whoever wrote it, into one verdict:

- **justified**: it names a real defect or a clear improvement within the PR's scope. Make the change, verify it with the repository's own lint/test commands for the touched files, and commit it (one commit per thread, or per group of threads fixed by one change; conventional commit style matching `git log`). Stage by explicit file path (`git add <file>…`), never a directory, `-A` or `-a`.
- **unjustified**: wrong, out of scope, or contradicted by the codebase. Write a *rebuttal*: the concrete reason, with file/line or doc evidence, opening with an @-mention of the comment's author.
- **question**: it asks rather than requests. Answer it the same way, @-mentioning the author. When the honest answer reveals a defect, the verdict is justified.
- **decision**: the fix is a trade-off only the PR's owner can make (security posture, a scope or spec change). Change nothing; reply once with the options and the cost of each, @-mentioning the author, and list it under left-to-the-user in the report.

An outdated thread (`isOutdated`) whose point a later commit already addresses is justified with that commit as its fix. Two comments demanding incompatible changes: a human's outranks a bot's (the bot's gets a rebuttal naming the human's thread); between two humans, apply neither and reply in both, linking each to the other and @-mentioning both authors. A thread already holding two rebuttals of ours is left to the user: list it in the report and post nothing more.

After the fixes are committed, `git push` once, then post and resolve through GraphQL (`THREAD_ID` is the thread's `id`):

```bash
gh api graphql -F threadId=THREAD_ID -f body="$BODY" -f query='
mutation($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $threadId, body: $body}) { comment { url } }
}'
gh api graphql -F threadId=THREAD_ID -f query='
mutation($threadId: ID!) { resolveReviewThread(input: {threadId: $threadId}) { thread { isResolved } } }'
```

- **justified**: reply `Fixed in <short SHA>.` with one line on what changed, then resolve.
- **unjustified** or **question** from a bot (`author.__typename == "Bot"`): post the reply, then resolve.
- **unjustified** or **question** from a human: post the reply and leave the thread unresolved; it is now awaiting and theirs to resolve.
- **decision**, from anyone: post the reply and leave the thread unresolved; it is handed over.

A thread with `viewerCanReply` or `viewerCanResolve` false goes into the report unhandled.

## 4. Decide: stop or wake

**Done** when every required check is green, every red non-required check has had its one ci-fix run, and no unresolved thread remains: stop, reporting success.

Otherwise stop when one of these holds:

- Every required check is green and every unresolved thread is either *handed over* (two rebuttals already posted, a decision reply posted, or `viewerCanReply`/`viewerCanResolve` false) or awaiting a human whose newest reply of ours is older than 24 hours: nothing left is ours to move.
- A stop named in steps 1 to 3 fired.
- This is iteration 48 of the loop.

Else call `ScheduleWakeup` for the next iteration, choosing the delay by what is still moving:

- something was pushed or checks are pending: 5 minutes, longer when the pending checks took longer on earlier runs;
- every required check is green and only awaiting threads remain: 30 minutes, then 60 once an iteration found nothing new.

End every iteration with one status line: checks green/red/pending counts, threads open/awaiting, and what this iteration did.

## Final report

On every stop: why it stopped; commits pushed during the loop (short SHA and subject); threads fixed, rebutted and answered, with URLs; every thread or check left to the user, each decision with its options, and what it needs from them.
