# The close: propose, never push

Read by `implement-tasks` step 5, once, when the loop ends.

When every repository-bearing task is `done`, or the loop ends short of that, close with one
end-of-run report and one question batch — everything the run deferred lands here, so nothing
earlier had to stop for it. A loop that ended short proposes only the branches whose tasks are all
`done` and asks nothing about the rest; their state is in the report. The report
holds, in this order: one table — repository, branch, its stack base,
its worktree path, tasks on it, the element codes those tasks carry, proposed pull-request title
citing the tickets; the still-open operational tasks — they need the branches landed first, so
they never gate this proposal; *Decisions taken for you*, each with how to revert it; and the
`review` items left open, numbered, each with its `cr-report.md` path. Stacked branches make a pull-request chain: each pull
request's base is its branch's stack base, and after one lands its successor is retargeted onto
the default branch — but only when the predecessor landed as a merge commit. After a squash
merge the predecessor's branch is no longer an ancestor of the default, so a bare retarget
shows the whole stack as new: merge `origin/<default>` into the successor first, then retarget.
Say that in the proposal, together with each branch's landing facts from the split report read in
step 1 — a draft pull request until a gate clears (`gh pr create --draft`), a retarget once a
prerequisite merges, the merge order. The batch then asks two things: whether to push the branches and open
the pull requests, and which open `review` items, by number, go to a repair before that. Recommend
per item on its merit and offer one "all fixable" option; list a branch's boy-scout findings — the
report's separate list, pre-existing code in a touched file — on their own line, recommended to
leave. A decision taken for the user that they want reverted is named the same way. Only
after explicit consent: push, `gh pr create` per branch (`--base` set to the stack base) with a
description naming the tasks, the spec and the branch's element codes. When the repository's own
rules reserve pushing to a human — its `AGENTS.md`, `CLAUDE.md` or contributing guide says so —
the push is not a question: print the exact `git push` and `gh pr create` commands instead.
The batch also asks about cleanup, recommending it: remove the `.worktrees` directories and
the merged `task/<slug>` branches now, or keep them and print the commands that remove them. A
`task/<slug>` branch with commits its target branch does not contain is never removed, whatever
the answer — it is unmerged work, and the report names it. Declining to publish while wanting a
clean repository is a normal combination. If push consent does not come, leave every target
branch local. The worktree paths are
in the table whatever the user decides: a branch whose worktree nobody can name is a branch the
user cannot open, and the run's own directories are not guessable. When the tasks directory is
untracked, say that too: it is the only copy of the
run's state store, one `git clean -fd` away from gone.
