---
name: pr-open
description: Push the current branch and open a pull request whose body fills the repository's PR template in Smart Brevity style. Use when the user asks to open, create or raise a PR, to push a branch for review, or to refresh an existing PR's description.
argument-hint: "[draft] [base branch]"
---

Request: **$ARGUMENTS**

Invoking this skill authorizes the push. Every claim in the PR body is backed by **evidence**: the diff, a commit message, a linked issue, or a command run in this session.

## 1. Preconditions

Run `git fetch origin` first, then resolve each before moving on:

- **Branch.** `git branch --show-current`. On the default branch (`gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`) or a detached HEAD, stop and say so.
- **Working tree.** When `git status --porcelain` prints anything, list it and ask whether to open the PR from the committed state or stop so the user can commit. The PR carries commits only; this skill never commits.
- **Base.** Take a base named in the request. Otherwise use the default branch, unless the branch is stacked: when an open PR's head branch (`gh pr list --state open --json headRefName`) is an ancestor of HEAD (`git merge-base --is-ancestor origin/<head> HEAD`), base on the nearest such branch and say so.
- **Commits ahead.** `git log --oneline origin/<base>..HEAD` lists at least one commit. With none, stop: there is nothing to open.
- **Existing PR.** `gh pr list --head <branch> --state open --json number,url`. When one exists, push (step 5), print its URL, and ask whether to rewrite its description from the current diff. On yes, draft the body (steps 2-4) against that PR's base and apply it with `gh pr edit <number> --body-file <file>`. Leave its title as it is.

## 2. Gather the change

- `git log --format='%h %s%n%b' origin/<base>..HEAD` for intent, `git diff --stat origin/<base>...HEAD` for scope, `git diff origin/<base>...HEAD` for substance. Read the diff itself; the commit subjects alone miss what changed.
- **Linked issue.** Look for an issue number or tracker key (`#123`, `ABC-123`) in the branch name and commit messages. Write `Closes #123` only for a GitHub issue that a commit or the branch explicitly names; mention a tracker key as plain text.
- **Why.** Take it from commit bodies, the issue, or the conversation. When none of them gives a reason, describe the effect of the change and leave the motive out.
- **Testing.** Collect what is evidenced: tests added or changed in the diff, and commands run in this session with their result. Nothing else counts as tested.

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
**<The one big thing, one sentence.>**

**Why it matters:** <one or two sentences>

**What changed:**
- <bullet>

**How tested:**
- <evidence, or "No test run recorded.">

**Go deeper:** <issue or doc link; drop this line when there is none>
```

## 4. Fill the template

Keep the template's structure intact: every heading, in its order, and every checklist item. Fill each section in the human voice below.

- Delete instructional HTML comments (`<!-- ... -->`) and replace placeholder prompts with the answer.
- A section the change does not touch gets `N/A`, plus a few words of reason when it is not obvious.
- Tick a checkbox only when evidence shows it is true. Leave the rest unticked, as written.
- The first section that describes the change opens with the **one big thing** in bold, then a **Why it matters** line, then bullets.

**Title.** Check `git log --format=%s -30 origin/<base>`: when most subjects follow Conventional Commits (`type(scope): subject`), write the title that way, with the type and scope the branch's commits use. Otherwise write a concise imperative sentence. Keep it under 70 characters.

### Human voice

- Lead with what changes for a reader of the code or a user of the product.
- One idea per bullet. Short, plain sentences with concrete nouns: the endpoint, the flag, the error message.
- Group bullets by behavior. Name a file only when the reviewer needs to find it.
- Bold the one big thing and the axiom labels (**Why it matters**, **What changed**); leave everything else plain.
- Write like an engineer explaining the change to a teammate: specific verbs (adds, removes, renames, fixes) over adjectives, numbers over intensifiers, and the claim itself with no preamble or closing summary.
- Keep the body short enough to read in under a minute; move long detail behind a **Go deeper** link.

## 5. Push and open

1. `git push -u origin HEAD`. On rejection, report the error and stop; resolving a diverged branch is the user's call.
2. Write the body to a file outside the repository: `mktemp -t pr-body.XXXXXX`.
3. `gh pr create --base <base> --head <branch> --title "<title>" --body-file <file>`, adding `--draft` only when the request asks for a draft.
4. Delete the temporary file.
5. `gh pr edit <url> --add-assignee @me`. It runs apart from the create because assignment can fail on its own (no push access to the base repository); on failure the PR stays opened, and the report says it is unassigned and why.

Done when the PR exists and its URL is printed. End with the URL, the base, the template used (or "default"), and each section left `N/A` or checkbox left unticked for the author to complete.
