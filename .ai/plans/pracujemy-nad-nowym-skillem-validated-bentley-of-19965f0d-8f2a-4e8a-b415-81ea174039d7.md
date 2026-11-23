# dev-kit: `merge-in-head` skill

## Context

The user often types the same short prompt: "merge in main (or the PR's base) and resolve the conflicts". It should be one skill, `/dev-kit:merge-in-head`, that finds the branch's parent ("head" in the user's words; the base branch), merges it in, and resolves conflicts the way the user's personal `resolving-merge-conflicts` skill (`~/.agents/skills/resolving-merge-conflicts/SKILL.md`) does, since that method works well. Its five steps are inlined: a shipped plugin cannot depend on a skill in the user's home directory. Pushing is off by default; a new `userConfig` option turns on pushing without asking.

Decisions taken with the user:
- With no open PR, git heuristics pick the base; when they disagree or find nothing, the skill **asks, proposing candidates with their evidence**. When every source points to one branch, it merges without asking.
- Tests: **promptfoo cases in `plugins/dev-kit/evals`**.

Confirmed fact: `gh pr create` reads `git config branch.<current>.gh-merge-base` as the PR base when `--base` is missing (gh man page `gh-pr-create`, cli/cli#10112), so that key is a valid local, GitHub-independent signal.

## Base detection order (the core of the skill)

1. **Explicit argument**: a branch name or PR number wins.
2. **Open PR**: `gh pr view --json number,state,baseRefName,url`; `OPEN` → `baseRefName`. Missing `gh`, no auth, or no PR → next step.
3. **`git config branch.<cur>.gh-merge-base`**: authoritative when set.
4. **Heuristics** (these work without GitHub):
   - reflog: oldest entry of `git reflog show --format=%gs refs/heads/<cur>`, `branch: Created from <X>` (ignore `HEAD` and SHAs);
   - nearest branch: among remote branches (local ones when there is no remote) other than `<cur>` and ones already containing HEAD, the one with the fewest commits in `<candidate>..HEAD`;
   - the default branch from `git symbolic-ref refs/remotes/origin/HEAD` as the last candidate.
   One agreed answer → merge. Disagreement or nothing → `AskUserQuestion` listing each candidate with its evidence, most likely first.

Then merge the remote-tracking ref (`git fetch <remote> <base>`, merge `<remote>/<base>`), or the local branch when the repository has no remote.

## Steps

- [x] Load the `agent-prompting` skill (per the agent-engineer hook) and the dev-kit skill conventions from `plugins/dev-kit/skills/ci-fix/SKILL.md` (invocation contract, result block, explicit `allowed-tools`).
- [x] Write `plugins/dev-kit/skills/merge-in-head/SKILL.md`:
  - frontmatter: `name: merge-in-head`; a "pushy" description (merge main/base/parent into the branch, bring a branch up to date, a PR "has conflicts with main"); `argument-hint: "[base branch | PR number]"`; `allowed-tools` limited to the git/gh commands used plus `Read Edit Write Grep Glob AskUserQuestion`.
  - **Preconditions**: a merge already in progress → skip straight to conflict resolution; a rebase in progress, detached HEAD, or a dirty tree (untracked files allowed) → stop and say which. Being on the base itself → stop.
  - **Find the base**: the order above.
  - **Merge**: `git merge --no-edit <remote>/<base>`; never rebase or force-push. Already up to date (`git merge-base --is-ancestor`) → report `up-to-date`.
  - **Resolve conflicts**: the five steps from `resolving-merge-conflicts`, kept close to the original text: see state (`git status`, `git log --merge`), find primary sources (commits, PRs via `gh`, tickets), resolve each hunk preserving both intents without inventing behaviour and without `--abort` unless the user asks, run the project's checks (typecheck, tests, format), and finish the merge commit with only the resolved files staged, never untracked ones.
  - **Push**: read `${user_config.merge_auto_push}`; `true` → `git push` (`-u <remote> <cur>` when there is no upstream). Anything else, including text still starting with `${user_config.` (unset: see memory `cc-userconfig-skill-substitution`) → ask. No remote → skip and say so.
  - **Result block** in the `ci-fix` style: `status: merged | merged-with-conflicts-resolved | up-to-date | blocked`, `base: <ref> (<source: pr #n | gh-merge-base | reflog | nearest | default | asked>)`, `conflicts`, `checks`, `commit`, `pushed`, `next`.
- [x] `plugins/dev-kit/.claude-plugin/plugin.json`: add `userConfig.merge_auto_push` (`boolean`, default `false`, "merge-in-head pushes the merge without asking"); add keywords `git`, `merge`. Check the current plugin docs first (`code.claude.com/docs/llms.txt` → plugins reference, scraped once to the scratchpad), per repo rules.
- [x] Description: add the new chore to `plugin.json` and the `marketplace.json` entry (identical, max two sentences) through `/compound-writing:cw-scribe` → `cw-reader` → `cw-ai-check`; mirror the tags in `marketplace.json`.
- [x] `plugins/dev-kit/README.md`: a `merge-in-head` section (usage, base detection order, the `merge_auto_push` setting); update the intro's "four chores" count.
- [x] `plugins/dev-kit/CHANGELOG.md`: entry under `[Unreleased]`.
- [x] Evals in `plugins/dev-kit/evals/`:
  - `reset-sandbox.sh`: build three sandboxes with a bare origin: **mih-pr** (PR #20 based on `develop`, not `main`; conflicting hunk in one file), **mih-reflog** (no PR; branch made with `git switch -c feature origin/develop`, so the reflog says "Created from origin/develop"; conflict), **mih-clean** (no PR, `gh-merge-base` set, clean merge).
  - `gh-stand-in.sh`: unchanged; it already fails `gh pr view` for a branch without a PR. It matches PRs by branch name across sandboxes, so the reflog case uses its own branch, `feat/casual-greeting`.
  - `prompts/merge-in-head.txt` (same pattern as `pr-open.txt`), `checks/merge-in-head.mjs`, tests in `promptfooconfig.yaml` with `answer` denying the push question.
  - Checks: HEAD is a merge commit whose second parent is `origin/develop`; no conflict markers in the tree; both sides' intents present in the resolved file; the bare origin's branch unchanged (no push without consent); the result block names the base source (`pr #20`, `reflog`, `gh-merge-base`).
- [x] Run checks and evals (below); fix what they find. Run 1: reflog case asked on a nearest tie (0/3); rule changed, run 2: 9/9. Manual run in a throwaway clone not done.

## Critical files

- new `plugins/dev-kit/skills/merge-in-head/SKILL.md`
- `plugins/dev-kit/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`
- `plugins/dev-kit/README.md`, `plugins/dev-kit/CHANGELOG.md`
- `plugins/dev-kit/evals/{reset-sandbox.sh,gh-stand-in.sh,promptfooconfig.yaml,prompts/merge-in-head.txt,checks/merge-in-head.mjs}`

## Verification

- `node scripts/verify-plugins.mjs`, `claude plugin validate plugins/dev-kit`, ShellCheck on the two eval scripts (or the `verify` skill, which runs all of them).
- `scripts/run-evals.sh dev-kit mih --trials 3`, logging the command in the suite's `local/<experiment>/RUNS.md`; all three cases must pass on every trial.
- A manual run in a throwaway clone: a branch behind `main` with a conflict, `/dev-kit:merge-in-head`, then once more with `merge_auto_push=true` set through `/plugin`.

## Out of scope (follow-ups)

- `pr-shepherd` stops on a conflicting PR with "resolving it is the user's call"; its stop report could point to `/dev-kit:merge-in-head`.
- Releasing dev-kit (`release` skill) once merged.
