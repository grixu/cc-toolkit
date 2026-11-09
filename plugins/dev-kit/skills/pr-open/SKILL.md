---
name: pr-open
description: Push the current branch and open a pull request whose body fills the repository's PR template as a short reviewer-first description with a before/after table, honest testing and deploy steps. Use when the user asks to open, create or raise a PR, to push a branch for review, or to refresh an existing PR's description.
argument-hint: "[draft] [base branch]"
---

Request: **$ARGUMENTS**

Invoking this skill authorizes the push. It does not cover merging or rebasing the base into the branch, resolving conflicts, force-pushing, or changing the PR itself (close, reopen, base, title, body unless this skill's step says so); a later user message grants one of these only when it names it explicitly. This invocation is the explicit, per-branch consent that repository rules reserving `git push` for humans ask for; say so once in the first status line.

Every claim in the PR body is backed by **evidence**: the diff, a commit message, a linked issue, a command run in this session, or a check the user reports in the conversation.

## 1. Preconditions

Run `git fetch origin` first, then resolve each before moving on:

- **Branch.** `git branch --show-current`. On the default branch (`gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`) or a detached HEAD, stop and say so.
- **Working tree.** When `git status --porcelain --untracked-files=no` prints anything, list it and ask whether to open the PR from the committed state or stop so the user can commit. The PR carries commits only; this skill never commits. Untracked files do not block; list their paths in the final report as not in the PR.
- **Existing PR.** Check this before the base: `gh pr list --head <branch> --state open --json number,url,baseRefName`. When one exists, push (step 5), assess the risk against that PR's base and update its risk label (step 2 **Risk**, step 5.6), report its URL, its base, the push result and the risk, and finish. When its body (`gh pr view <number> --json body --jq .body`) has a `## Risk` section, replace that section, from its heading up to the next heading or the link reference definitions that end the body, with the new result in the step 4 shape and apply it with `gh pr edit <number> --body-file <file>`, so the body never contradicts the label; a body without the section stays as it is. Rewrite its description only when the request asks for it: draft the body (steps 2-4) against that PR's base, edit the current body as step 4 **Existing body** says, and apply it with `gh pr edit <number> --body-file <file>`, leaving its title as it is. Otherwise offer the rewrite in one line of the report, not as a question.
- **Base.** Take a base named in the request. Otherwise use the default branch, unless the branch is stacked: when the head branch of an open PR other than the current branch (`gh pr list --state open --json number,headRefName`) is an ancestor of HEAD (`git merge-base --is-ancestor origin/<head> HEAD`), base on the nearest such branch and say so. Every other such ancestor that is not itself an ancestor of the chosen base (`git merge-base --is-ancestor origin/<head> origin/<base>` fails) is a second parent: name its PR in the report and in the body's dependency section, and say that its commits show in this PR's diff until it merges.
- **Commits ahead.** `git log --oneline origin/<base>..HEAD` lists at least one commit. With none, stop: there is nothing to open.
- **Behind base.** When `git rev-list --count HEAD..origin/<base>` is above zero, report the count and whether `git merge-tree --write-tree HEAD origin/<base>` conflicts (it exits 1), then open the PR as it stands. Never merge, rebase or commit here; offer the sync in the report as a separate step.

## 2. Gather the change

- `git log --format='%h %s%n%b' origin/<base>..HEAD` for intent, `git diff --stat origin/<base>...HEAD` for scope, `git diff origin/<base>...HEAD` for substance. Read the diff itself; the commit subjects alone miss what changed.
- **Already merged.** A squash merge lands a branch commit on the base under another hash, so it still shows in the log above. Leave a commit out of the body only when a base commit carries it, judged by whole lines of `git log origin/<base> --format=%s%n%b`: a subject equal to the commit's, optionally followed by ` (#N)`, or a squash-body line `* <subject>`. A substring match is not enough, a `Revert "…"` commit never counts, and when a match is doubtful the work stays in the body.
- **Linked issue.** Look for an issue number or tracker key (`#123`, `ABC-123`) in the branch name, commit messages and the conversation. Write `Closes #123` only for a GitHub issue that a commit or the branch explicitly names; mention a tracker key as plain text. When the request, branch or commits name an issue and a tool that reads it is available (`gh issue view` for GitHub, an MCP server for another tracker), read its title and description; without such a tool, go on without them.
- **Why.** Take it from commit bodies, the issue, or the conversation. When none of them gives a reason, describe the effect of the change and leave the motive out.
- **Design docs.** Collect the specs, ADRs and design documents the diff adds or a commit message names.
- **Testing.** Collect what is evidenced: tests added or changed in the diff, commands run in this session with their result, and checks the user reports, credited to them. Nothing else counts as tested. Note what was not done where a reviewer would assume it was: a UI change nobody opened in a browser, new tests nobody ran.
- **Deploy steps.** Collect what must happen outside the merge for the change to work, from the diff and the conversation: a database migration, infrastructure code (`*.tf`), a new env var or secret, a permission or policy change, identity-provider configuration, a feature flag to flip, a pull request in another repository.
- **Risk.** Call the `mcp__dev-kit__pr_risk` tool with `base` set to the chosen base; when it is not loaded, look it up with tool search first. Also pass `slices`: the changed files from the diffstat grouped by purpose of the change (a feature, a fix, a refactor), each slice holding every file that serves that purpose across layers, its tests and docs included, every file in exactly one slice, and a title of a few neutral words that says what changes and never how risky it is. A change with one purpose is one slice. Pass `context` as well: the linked issue's title and description when you read them, and the why from above in a sentence or two; for an existing PR, its current title and body. When the repository states what it tests — in `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING*`, `.claude/rules/` or what its CI runs — pass `testing_policy`: those rules in a few sentences, such as which code needs unit or integration tests, what is left to e2e, and what is never tested; leave it out when the repository says nothing. The tool exists only when a TypeSafe key is configured, so a missing tool means the PR opens without a risk section or label, and the report says `Risk: not assessed (pr_risk tool not available)`. A result starting `Risk assessment unavailable:` means the same, with its reason in the report. Otherwise the result is JSON: `level`, `scorer`, `impact` and `likelihood` (each with its own `level`), `complexity`, `evidence` (`needed`: the manual evidence types that would show the change works, `provided`: those found in `context`, `credited`: whether they lowered the level), `confidence`, `lowConfidence`, `adjustments` (the rules that moved the level), `intents` (what the change does: `new_functionality`, `behavior_change`, `behavior_condition_change`, `bug_fix`, `refactor`, `rename_or_move`, `code_removal`), `types` (change type ids), `flags` (each with `label`), `slices` (each with `title`, `level`, `impact`, `likelihood`, `complexity`, `evidence`, `testGap`, `adjustments`, `intents`, `types` and `flags`), `model`, `label` and `coverage`. It is evidence from a model, not a verdict: quote it as given and never adjust the level. Evidence counts only when `context` carries it (an uploaded screenshot or video, a Loom link, a request or response in a code block), so a new PR's body rarely earns it; refreshing the description after the evidence is attached reassesses the risk.

- **Execution context.** When a changed file depends on behavior outside its diff, optionally pass `execution_context` to `pr_risk`: at most 8 changed-file entries, each `{path, sources}` with up to 4 sources `{path, ref, symbol?, facts}`. Use full commit IDs for HEAD or the chosen base, and copy up to 4 short exact excerpts per source from `git show <commit>:<path>`; each excerpt must be at most 500 characters. The entire array must fit 8,000 characters. Collect only the source needed to understand execution boundaries and effects; missing evidence stays unknown. This is targeted context, not a full code review. Omit the previous generated trailing `## Risk` section from existing PR context.

## 3. Find the template

From the repository root, match file names case-insensitively, any extension (`.md`, `.txt`):

```sh
find . -maxdepth 3 -type f \( -ipath './pull_request_template*' -o -ipath './docs/pull_request_template*' -o -ipath './.github/pull_request_template*' \)
```

- A single `pull_request_template.*` file is the default GitHub prefills. With several, prefer `.github/`, then the root, then `docs/`.
- Files inside a `PULL_REQUEST_TEMPLATE/` directory are alternatives. Pick the one whose name or content fits the change (a `bug.md` for a fix); when two fit equally, ask which to use.
- With nothing in the repository, check the owner's public `.github` repository: `gh api repos/<owner>/.github/contents/<dir>` for `.github`, the root and `docs`, then read a match with `gh api repos/<owner>/.github/contents/<path> --jq .content | base64 -d`.
- With no template anywhere, use:

```markdown
<What changes for a user, caller or operator, and why: one to three plain sentences.>

| | Before | After |
|---|---|---|
| <what a reviewer or user notices> | <before, or — when new> | <after> |

**Testing:** <evidence, and what was not checked>

**Reviewer notes:** <what to look at hard; drop this line when there is nothing>

**Dependencies:** <deploy steps and parent PRs; drop this line when there are none>

**Go deeper:** <issue or doc link; drop this line when there is none>
```

## 4. Fill the template

Keep the template's structure intact: every heading, in its order, and every checklist item. Write for a reviewer who has not seen the work and reads many of these a day: why the change exists, what changed in behavior, what was verified, and what must happen outside the merge. The linked ticket holds the backstory; do not retell it.

- Delete instructional HTML comments (`<!-- ... -->`) and replace placeholder prompts with the answer.
- A ticket field gets the key from step 2. With none, write `None` and say so in the report; never leave a partial placeholder such as `PL-` or guess a key.
- A dependency or deployment section lists the deploy steps from step 2 and the second parents from step 1. With nothing to list, write `- None` under a repository template and drop the line under the default one.
- Any other section the change does not touch gets `None`, plus a few words of reason when it is not obvious.
- Tick a checkbox only when evidence shows it is true. Leave the rest unticked, as written.
- The section that describes the change holds these parts, in order, each only when it has content:
  1. One to three plain sentences: what changes for a user, caller or operator, and why. No bold lead line and no label.
  2. A before/after table with one row per thing a reviewer or user would notice, usually 3–10 rows; a row new in this change gets `—` under Before. The table replaces a bullet list of changes. Name an endpoint, migration, permission, flag or env var when that is the natural way to say it; leave out internal helpers and file lists. A change that only adds or fixes tests gets a short bullet list of what is now covered instead.
  3. A **Testing:** line from step 2.
  4. A **Reviewer notes:** line only when something needs a hard look: a migration, security-relevant logic, a known limitation, a manual step to try.
  5. A **Go deeper:** line linking the design docs from step 2 (a repository-relative path or a blob URL); drop it when there are none.
- With a risk result from step 2, append a `## Risk` section as the body's last section, also under a repository template, and leave it out otherwise. Link reference definitions that end a body (`[PL-1234]: https://…`, which tracker integrations append) stay below it. It does not count toward the length budget:

```markdown
## Risk

**<level>** · impact <impact.level> · complexity <complexity> · confidence <confidence> · assessed by <model>

- <flag label>

| Slice | Risk | Impact | Complexity | Evidence | What it does | Change types |
|---|---|---|---|---|---|---|
| <title> | **<level>** | <impact.level> | <complexity> | <evidence> | <intents, comma-separated> | <types, comma-separated> |

<sub>Partial assessment: <filesNotAssessed> files and <truncatedHunks> cut hunks were not assessed.</sub>
```

  The Evidence cell lists the slice's `evidence.needed`, each followed by `provided` or `missing`, and `—` when none is needed; add `test gap` when `testGap` is true. Write `No risk flags raised.` in place of the bullets when `flags` is empty. Give the table one row per entry of `slices`, riskiest first; when `slices` is empty, replace the table with a `What it does: <intents> · Change types: <types>` line. Under the table, list each slice's `adjustments` as `- <title>: <adjustment>`; leave the list out when no slice has one. Keep the `<sub>` line only when `coverage.partial` is true; when `coverage.factorsMissing` is above zero, add `<factorsMissing> slices had no factor answers.` to it, and leave out the files-and-hunks sentence when both of its counts are zero. Write `—` for any field the result lacks: a slice with `factors: "missing"`, and every complexity and evidence field when `scorer` is `"two-axis fallback"`, which also drops `· complexity …` from the first line. Add `Low confidence.` to the first line when `lowConfidence` is true.

**Existing body.** When this skill rewrites the description of an existing PR, edit its current body instead of starting over. Keep what this skill did not write: the author's sentences, bot lines, sections outside the template such as `## Code story`, and the link reference definitions at the end, verbatim. Replace the template sections and refresh facts that drifted: commits pushed since the body was written, a dependency that landed, a testing claim that is no longer true. The report says in one line each what changed.

**Title.** Check `git log --format=%s -30 origin/<base>`: when most subjects follow Conventional Commits (`type(scope): subject`), write the title that way, with the type and scope the branch's commits use. Otherwise write a concise imperative sentence. When most subjects end with a ticket key in parentheses, such as `(PL-1234)`, end the title with this branch's key the same way, and leave it off when the branch has none. Keep it under 70 characters, not counting that suffix.

### Voice and length

- Short, plain sentences with concrete nouns: the endpoint, the flag, the error message. Specific verbs (adds, removes, renames, fixes) over adjectives, numbers over intensifiers, and no preamble or closing summary.
- Bold only the labels (**Testing:**, **Reviewer notes:**, **Dependencies:**, **Go deeper:**); leave everything else plain.
- One screen: at most about 40 non-blank lines outside the Risk section. Summary or Changes sub-headings and file-by-file lists are the usual bloat, and the table already carries them. Put long logs in a `<details>` block and move other long detail behind the **Go deeper** link.
- Keep the body valid MDX as well as Markdown, since some repositories feed PR bodies to MDX tooling: no HTML comments, and a `<` or `{` in prose goes in backticks. The `<sub>` and `<details>` tags this skill uses are valid MDX.

## 5. Push and open

1. `git push -u origin HEAD`. On rejection, report the error and stop; resolving a diverged branch is the user's call.
2. Write the body to a file outside the repository: `mktemp -t pr-body.XXXXXX`.
3. `gh pr create --base <base> --head <branch> --title "<title>" --body-file <file>`, adding `--draft` only when the request asks for a draft.
4. Delete the temporary file.
5. `gh pr edit <url> --add-assignee @me`. It runs apart from the create because assignment can fail on its own (no push access to the base repository); on failure the PR stays opened, and the report says it is unassigned and why.
6. With a risk result whose `label.enabled` is true: `gh pr edit <url> --add-label "<label.name>"`, plus `--remove-label` for every other name in `label.all` the PR already carries (`gh pr view <url> --json labels`). When the add fails because the label does not exist, run `gh label create "<label.name>" --description "Pull request risk assessed by TypeSafe Jev"` once and retry; never pass `--force`, which rewrites an existing label. A label failure leaves the PR as it is, and the report says why.

Done when the PR exists and its URL is printed. End with the URL, the base, the template used (or "default"), a ticket field set to `None`, each section left `None` or checkbox left unticked for the author to complete, for a rewritten description what changed in it, the risk level with its flags and label, or why it was not assessed, the untracked paths that are not in the PR, and, when the branch is behind its base, by how many commits and with what conflict state. Close with one line suggesting `/dev-kit:pr-shepherd` to drive the PR to green; do not invoke it.
