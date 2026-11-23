---
name: merge-in-head
description: Merge the branch's base (its open PR's base, or the branch it was cut from) into the current branch, resolve every conflict by the intent behind both sides, run the project's checks and commit the merge. Use when the user asks to merge main (or develop, or "the base", "the parent") into their branch, to bring a branch or PR up to date, to fix a PR that "has conflicts with main", or to resolve the conflicts of a merge already in progress.
argument-hint: "[base branch | PR number]"
allowed-tools: Read Edit Write Grep Glob AskUserQuestion Bash(git status *) Bash(git status) Bash(git branch *) Bash(git config --get *) Bash(git reflog *) Bash(git remote *) Bash(git remote) Bash(git symbolic-ref *) Bash(git for-each-ref *) Bash(git rev-parse *) Bash(git rev-list *) Bash(git merge-base *) Bash(git fetch) Bash(git fetch *) Bash(git merge *) Bash(git log *) Bash(git diff *) Bash(git show *) Bash(git blame *) Bash(git ls-files *) Bash(git add *) Bash(git commit *) Bash(git push) Bash(git push *) Bash(gh pr view *) Bash(gh pr view) Bash(gh pr list *) Bash(gh issue view *)
---

Arguments: **$ARGUMENTS**

Brings the current branch up to date with its *base*, the branch it will be merged into, by a merge commit. It never rebases, force-pushes or edits the PR: the branch's published history stays as it is, so anyone who pulled it can keep working.

Every run ends with the **result block** (last section), even an early stop.

Run each git and gh command as its own call, without `;`, `&&`, `$(…)` or loops: the skill's pre-approved commands match single commands, and a compound one waits for the user's permission.

## 1. Check the checkout

Read `git status` (it reports a rebase in progress) and `git rev-parse -q --verify MERGE_HEAD` / `CHERRY_PICK_HEAD` (each exits non-zero when that operation is not in progress):

- **A merge is already in progress**: the base is the merge's `MERGE_HEAD`; go straight to step 4 and resolve what is left.
- **A rebase or cherry-pick is in progress, HEAD is detached, or tracked files have uncommitted changes**: stop with status `blocked`, naming which. Those changes are the user's; never stash, commit or discard them. Untracked files (`??`) do not block, and stay out of every commit.

## 2. Find the base

Take the first source that answers, and record which one it was for the result block:

1. **Argument**: a branch name is the base; a PR number means that PR's `baseRefName` (`gh pr view <n> --json baseRefName,headRefName`; when its `headRefName` is not the current branch, stop `blocked`).
2. **Open PR** for the current branch: `gh pr view --json number,state,baseRefName,url`. Use `baseRefName` when `state` is `OPEN`. No `gh`, no login, no PR, or a closed one: go on.
3. **`git config --get branch.<current>.gh-merge-base`**: the base `gh pr create` will use for this branch, set by the user or by gh.
4. **Git's own traces**, when none of the above answers:
   - *reflog*: the oldest entry of `git reflog show --format=%gs refs/heads/<current>` reads `branch: Created from <ref>` when the branch was cut from a named ref. It names nothing when `<ref>` is `HEAD`, a SHA, or the branch's own remote copy (`refs/remotes/origin/<current>`, a branch checked out from the remote), or when the entry is `clone: from …`; the reflog may also have expired.
   - *nearest*: among the remote branches (the local ones when the repository has no remote), leaving out the current branch and every branch that already contains HEAD (`git merge-base --is-ancestor HEAD <ref>`), the one with the fewest commits in `git rev-list --count <ref>..HEAD`. Then drop each *sibling*: a branch whose merge-base with HEAD equals the default branch's merge-base with HEAD adds nothing the default branch does not explain, unless it is an integration branch (`develop`, `dev`, `staging`, `release/*`, or the base of another open PR). Other feature branches cut from the same commit of main are siblings, not bases. A tie among what is left names no single branch.
   - *default*: the remote's default branch, `git symbolic-ref --short refs/remotes/<remote>/HEAD`.

   The base is settled when the reflog names a branch that is nearest or tied for nearest (a branch cut from develop while develop still equalled main ties the two), or when the reflog names nothing and nearest is the default branch alone (a branch cut from main whose reflog has expired); `develop` and `origin/develop` count as the same branch. Otherwise ask the user with `AskUserQuestion`, one option per candidate with its evidence in the description (`reflog: Created from origin/develop`, `3 commits ahead of origin/main`), the most likely first. Guessing wrong merges unrelated work into the branch, which is costly to undo once pushed, so ask rather than pick.

Normalise the base to a ref you can merge: with a remote, `git fetch <remote> <branch>` and use `<remote>/<branch>` (the base's latest pushed state, not a stale local copy); without one, the local branch. The base being the current branch itself, or a branch missing on the remote, is status `blocked`.

## 3. Merge

When `git merge-base --is-ancestor <base> HEAD` holds, the branch already contains the base: status `up-to-date`, nothing to commit.

Otherwise run `git merge --no-edit <base>`. A clean merge commits itself; go to step 5, since a merge without conflicts can still break the code. On conflicts, go to step 4.

## 4. Resolve the conflicts

1. **See the current state** of the merge. Check git history, and the conflicting files (`git status`, `git diff --name-only --diff-filter=U`, `git log --merge --oneline`).
2. **Find the primary sources** for each conflict. Understand deeply why each change was made, and what the original intent was. Read the commit messages (`git log --merge -p -- <file>`), check the PRs (`gh pr list --search <sha> --state merged`), check original issues/tickets.
3. **Resolve each hunk.** Preserve both intents where possible. Where incompatible, pick the one matching the merge's stated goal (here: the branch's feature, brought up to date with the base) and note the trade-off. Do **not** invent new behaviour. Resolve rather than abort; run `git merge --abort` only when the user asks for it. No conflict marker (`<<<<<<<`, `=======`, `>>>>>>>`) may remain in a resolved file.
4. **Finish the merge.** Stage the resolved files by explicit path (`git add <file>…`), never `-A` or a directory, leaving untracked working files out, and `git commit --no-edit` to keep git's merge message.

## 5. Run the checks

After every merge, clean or resolved, discover the project's **automated checks** and run them, typically typecheck, then tests, then format. Fix anything the merge broke, including code that merged cleanly but no longer fits (a renamed function still called by its old name, a test of behaviour the base deliberately changed). Commit each fix separately, with a message saying what the merge broke, never by amending the merge, and stage by explicit path as above. A check that already fails on the branch or the base without the merge is not the merge's to fix; name it in `checks`. A check you could not run (permission refused, missing tool) is `not run: <why>`, never a pass.

## 6. Push

Read the setting `${user_config.merge_auto_push}`:

- `true`: push at once.
- anything else, including text still starting with `${user_config.` (the setting was never saved; it lives nowhere else, so don't look for it in git config or files): ask with `AskUserQuestion`, options **Push now** and **Leave it local**, naming the branch and remote in the question.

Push with `git push`, or `git push -u <remote> <current>` when the branch has no upstream. A repository without a remote skips this step (`pushed: no: no remote`). A rejected push (the remote moved meanwhile) is reported, never forced.

## Result block

End with this block, exactly these keys, each on one line:

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

`merged` is a clean merge, `resolved` a merge whose conflicts this run resolved.
