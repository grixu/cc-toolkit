---
name: pr-shepherd
description: Shepherd the current branch's pull request in a self-paced loop until CI is green and every review thread is resolved, fixing failures and review comments with commits and pushes, and answering the unjustified ones in-thread. Use when the user asks to babysit, watch or drive a PR to green, or to keep fixing CI and review comments until the PR is clean.
argument-hint: "[iteration]"
disallowed-tools: AskUserQuestion
---

Arguments: **$ARGUMENTS**

Invoking this skill authorizes every commit and push it describes, on the PR's branch only. It runs unattended: wherever it needs a human, it *stops* (below) with a report instead of asking.

## Entry

This skill body is one *iteration* of a self-paced `/loop`. When the arguments carry `iteration`, or this turn is already a `/loop` fire, run the iteration. Otherwise invoke the `loop` skill with the arguments `/dev-kit:pr-shepherd iteration` and end the turn: the loop runs the first iteration at once and paces the rest. When the `loop` skill is unavailable, run one iteration and tell the user the loop could not start.

Every iteration re-reads the whole state from git and GitHub; the transcript of earlier iterations counts only toward the caps.

To **stop**: call `ScheduleWakeup` with `stop: true` (on a fixed-interval loop, delete its job with `CronDelete` instead), then write the final report.

## 1. Read the state

1. `gh pr view --json number,url,state,headRefName,baseRefName,headRefOid,mergeable,comments,reviews`. No PR for the current branch, or `state` is not `OPEN`: stop.
2. `git status --porcelain` and `git fetch`, then `git rev-list --left-right --count HEAD...@{u}`. A dirty tree, local commits ahead of the remote, or a diverged branch: stop, naming which; those changes are the user's. Behind only: `git pull --ff-only`.
3. `mergeable == "CONFLICTING"`: stop; resolving conflicts with the base is the user's call. `UNKNOWN` is still computing and blocks nothing.
4. Checks: `gh pr checks --required --json name,bucket,state,link,workflow`; when it reports no required checks, the same without `--required`. `pass` and `skipping` (skipped, neutral) are green; `fail` and `cancel` are *red*; `pending`, or no checks reported yet for the head commit, is *pending*.
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

When any check is red, invoke `dev-kit:ci-fix` with the arguments `<PR url> push-authorized`, and read its result block:

- `fixed` or `rerun`: CI restarts; continue.
- `nothing-to-fix`: the red check went green or pending meanwhile; continue.
- `not-fixable` or `blocked`: finish step 3, then stop with ci-fix's `cause` and `next`.

**Fix cap**: when the same check is red again after two ci-fix runs that reported `fixed` or `rerun` for it, stop instead of invoking ci-fix a third time; the cycle needs a human.

## 3. Handle review

Take every *open* thread, reading the whole thread, the code at `path`/`line` on HEAD, and the PR's intent. Also read the `reviews` bodies and the PR conversation `comments`: they have no resolution state, so they sit outside the exit condition, but a concrete change request in one that no later comment of ours links to is handled like a thread, answered once with `gh pr comment <N> --body` that links its URL.

Judge each comment on its merits, whoever wrote it, into one verdict:

- **justified**: it names a real defect or a clear improvement within the PR's scope. Make the change, verify it with the repository's own lint/test commands for the touched files, and commit it (one commit per thread, or per group of threads fixed by one change; conventional commit style matching `git log`).
- **unjustified**: wrong, out of scope, or contradicted by the codebase. Write a *rebuttal*: the concrete reason, with file/line or doc evidence, opening with an @-mention of the comment's author.
- **question**: it asks rather than requests. Answer it the same way, @-mentioning the author. When the honest answer reveals a defect, the verdict is justified.

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

A thread with `viewerCanReply` or `viewerCanResolve` false goes into the report unhandled.

## 4. Decide: stop or wake

**Done** when every check is green and no unresolved thread remains: stop, reporting success.

Otherwise stop when one of these holds:

- CI is green and the only unresolved threads are awaiting a human whose newest reply of ours is older than 24 hours: the reviewers went quiet.
- A stop named in steps 1 to 3 fired.
- This is iteration 48 of the loop.

Else call `ScheduleWakeup` for the next iteration, choosing the delay by what is still moving:

- something was pushed or checks are pending: 5 minutes, longer when the pending checks took longer on earlier runs;
- CI is green and only awaiting threads remain: 30 minutes, then 60 once an iteration found nothing new.

End every iteration with one status line: checks green/red/pending counts, threads open/awaiting, and what this iteration did.

## Final report

On every stop: why it stopped; commits pushed during the loop (short SHA and subject); threads fixed, rebutted and answered, with URLs; every thread or check left to the user and what it needs from them.
