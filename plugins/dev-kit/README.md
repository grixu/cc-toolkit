# dev-kit

dev-kit takes over four chores that interrupt work on a GitHub repository: fixing a red CI run, driving a pull request through review until it is green, checking whether a dependency upgrade breaks your code, and opening a pull request with a filled-in description. Each skill does the whole job, including commits and pushes where you allow them, and ends with a short report.

## Install

dev-kit is a Claude Code plugin. Add the `cc-toolkit` marketplace once, then install the plugin:

```
/plugin marketplace add grixu/cc-toolkit
/plugin install dev-kit@cc-toolkit
```

## Requirements

- The GitHub CLI `gh`, logged in (`gh auth status`) with access to the repository. Every skill calls it. A `## Proof` section in `pr-open` needs `gh` 2.99.0 or later, the first with `--attach`; an older `gh` fails `gh pr create` on that flag.
- A GitHub repository. `ci-fix` and `pr-shepherd` handle GitHub Actions runs and GitHub check runs only.
- To push a fix to a file under `.github/workflows/`, a token with the `workflow` scope.
- For `pr-shepherd`: Claude Code's built-in `/loop`. Without it, `pr-shepherd` runs one round and tells you the loop could not start.
- Optional, for `dep-upgrade-check`: the firecrawl and context7 MCP servers, which it uses to find migration guides. Without them it still reads GitHub releases, changelogs and guide files in the package's repository, then fetches the guide the release notes link to, and reports a guide it could not find as `no guide found`.
- Optional, for the risk assessment in `pr-open`: a [TypeSafe](https://docs.typesafe.ai/introduction) API key and Claude Code v2.1.287 or later, which loads the plugin's mod. See [Risk assessment](#risk-assessment-typesafe-jev).

## Skills

Run a skill with `/dev-kit:<skill>`, or describe the task ("CI is red on this PR", "will bumping vite to 7 break us?") and Claude picks the matching skill.

### ci-fix: fix a failed CI run

Use it when a GitHub Actions run, job or check has failed. Pass a run, job, PR or commit URL, a run ID, a PR number, or nothing for the current branch:

```
/dev-kit:ci-fix https://github.com/owner/repo/actions/runs/123456
/dev-kit:ci-fix 42
/dev-kit:ci-fix
```

It reads the failed logs and the workflow file, finds the change that caused the failure, reproduces it locally, fixes it, and runs the same command again to confirm the fix. It makes one commit per root cause and asks before pushing.

- A transient failure (lost runner, network timeout, rate limit) or a flaky test gets one rerun instead of a code change. A test whose subject the branch changes counts as flaky only after it passes locally twice; a rerun without a local run is reported as an unverified flake.
- An environment problem (missing secret, expired credential, permission, billing) is reported for an admin, not patched.
- It works only in a local clone of the failing repository, and asks before switching to the run's branch.
- It asks you before it skips, loosens or removes a check. Aligning an assertion with a documented contract is a fix, and the commit quotes the contract line.
- It never merges or rebases the base into the branch, resolves conflicts, force-pushes or edits the pull request unless you name that action.

When the cause is already fixed on the branch but no new run will come (a path filter, a deploy workflow), it reports `nothing-to-fix` and names the `gh workflow run` command for you; it never dispatches a deploy itself.

Output: a `ci-fix result` block with the status (`fixed`, `rerun`, `nothing-to-fix`, `not-fixable` or `blocked`), the cause, the commits, how the fix was verified, whether it was pushed, and what is left for you.

### pr-shepherd: drive a pull request to green

Use it when your branch has an open pull request and you want CI fixed and review comments handled without watching it. Pass several pull request numbers to shepherd a stack:

```
/dev-kit:pr-shepherd
/dev-kit:pr-shepherd 101 102 103
```

Running it authorizes commits and pushes to the pull request's branch, and counts as the per-branch push consent a repository rule reserving `git push` for humans asks for. Outside the stack merges below, it never merges or rebases the base into the branch, resolves conflicts, force-pushes, or closes, reopens or edits the pull request unless a later message of yours names that action. It starts a self-paced `/loop`, and each round does the following:

- It hands every red check to `ci-fix`, which may push without asking; it never fixes or reruns CI itself. A red check that is not required gets one `ci-fix` run; if it stays red, the report lists it for you instead of holding the loop.
- It judges each open review comment on its merits. For a comment it agrees with, it makes the change, commits and pushes it, replies `Fixed in <sha>`, and resolves the thread.
- It answers a comment it disagrees with, or a question, with evidence and an @-mention of the author. It resolves bot threads after replying and leaves human threads for the reviewer to resolve.
- A comment whose fix is a trade-off only you can make (security posture, scope) gets one reply listing the options and their cost; the thread stays open for you, and the report lists it.
- In a stack, each pull request gets its own worktree. A fix lands on the lowest branch that owns the code and reaches the branches above it by a plain merge of each base into its child, never a rebase; it never merges the default branch in.
- It waits 5 minutes while checks run, and 30, then 60 minutes while it waits for reviewers.

It never asks you anything mid-run. It stops and reports when any of these happens:

- Every required check is green and no review thread is open (success).
- The branch has no open pull request, uncommitted changes to tracked files or unpushed commits, or has diverged from the remote.
- GitHub reports the pull request as conflicting. It still handles the review threads and pushes, then stops and names the conflicting files; it never resolves the conflict, and running it again before you do stops the same way.
- `ci-fix` reports a failure it cannot fix, or the same check is red again after two fix or rerun cycles, whichever step made them.
- Every required check is green and every remaining thread waits on a human who has not replied for 24 hours, already holds two of its rebuttals or its reply on a decision, or cannot be replied to.
- It has run 48 rounds.

Output: a final report listing the commits pushed, the threads fixed, answered or rebutted (with links), and everything left for you.

### dep-upgrade-check: will this upgrade break us?

Use it before you merge a dependency bump, including Renovate and Dependabot pull requests. Pass a package with a version, a package alone for its latest release, or a pull request URL:

```
/dev-kit:dep-upgrade-check vite@7
/dev-kit:dep-upgrade-check zod
/dev-kit:dep-upgrade-check https://github.com/owner/repo/pull/42
```

It starts from the version your lockfile resolves today and lists every change up to the target from release notes, changelogs, migration guides and package metadata (`exports`, `engines`, peer dependencies). For a pull request, it also checks whether the lockfile now holds old and new copies of the package side by side. It then checks each change against the places your code uses the package. It works with pnpm, npm, yarn, Python, Go, PHP and Rust projects, container images and GitHub Actions. For a pull request, it also reads the pull request's CI result; a runner failure in a setup or cleanup step after the tests passed counts as neither for nor against the upgrade, and it suggests a rerun.

Before the compatibility work, it checks the target's security record in [OSV.dev](https://osv.dev) and the GitHub Advisory Database, for the target and for every new or changed transitive version the upgrade brings in:

- **blocked**: malware, a version the registry has taken down, or a version younger than its release-age cooldown. A recent version passes when it fixes a moderate-or-above vulnerability of the version it replaces. The report names the lowest safe version instead.
- **escalated**: a known vulnerability of moderate severity or above. The check reports whether your code uses the vulnerable function, but that never lowers the severity: it asks you to accept the risk, switch to the lowest safe version, or hold.
- **clear**: neither.

The cooldown follows your repository's own policy, so a check does not block what your dependency bot already waited for:

- **Renovate**: `minimumReleaseAge`, top level and per `packageRules` entry. The check evaluates the update type, package name, datasource, manager, dependency type and file name matchers. A rule with a matcher it cannot evaluate, such as `matchCurrentVersion`, counts at the stricter of its value and the one it overrides. An explicit `null` means no cooldown; a configuration that never sets `minimumReleaseAge` falls through to the sources below. Presets in `extends` are not resolved, except the 3 days on npm that `config:best-practices` adds.
- **Dependabot**: the `cooldown` block of the matching `updates` entry, or Dependabot's own 3 days without one.
- **pnpm**: `minimumReleaseAge` in `pnpm-workspace.yaml`, with `minimumReleaseAgeExclude`.
- **None of them**: 7 days.

For a pull request the configuration is read from the base branch, so a pull request cannot lower its own cooldown. The report names the value and its source, such as `cooldown 3 days (renovate.json packageRules[2]: matchUpdateTypes patch)` or `cooldown 7 days (default)`.

Package names are sent to api.osv.dev, api.github.com and api.deps.dev. Packages from a private registry are never sent and are listed as not checked. On a pull request it always posts one security comment with the outcome, the advisories and your decision, and updates that comment on a re-run.

The check is otherwise read-only: it changes no manifest, lockfile or source file. When the result is not `safe`, or questions remain open, it offers to install and build the upgrade in a throwaway git worktree, and runs that build only if you agree. Anything else that downloads and runs third-party code, such as pulling and running a container image, is offered the same way.

Output: the security outcome with its advisory table, a verdict (`safe`, `safe with changes` or `breaking`; marked `provisional`, at the worst value still possible, while an open question could change it), a table of affected changes with `file:line` locations and the fix for each, the open unknowns, and the sources it used. If you then ask it to apply the upgrade, it applies the fixes from the table and runs your checks: in your working tree for a package and version, or for a pull request on its branch in a separate worktree, committed locally and pushed only when you say so. It warns that Renovate and Dependabot drop commits that are not theirs when they rebase, and names the bot setting that would make the commit unnecessary.

Every run ends with a `dep-upgrade-check-result` block (`status`, `security`, `verdict`, `provisional`, `decision`, `decision_carried`, `units`, the two comment URLs, `reason`) that a script can parse. `decision` always holds the decision itself, such as `accepted` or `hold`, and `decision_carried` says whether it came from an earlier comment. A CI gate passes on `status: done`, `security` `clear` or `escalated`, and `decision` `accepted` or `n/a`, whether the decision was carried or not.

#### Unattended, in CI

Add `unattended` after the pull request URL, or run it where `GITHUB_ACTIONS=true`, and the check never waits for a person:

- Where it would ask, it stops with `status: stopped` and the reason: no input, or a pull request from another repository.
- An escalated outcome gets no question. The security comment goes up at once with the decision `pending`, and a maintainer decides by running the check on the pull request in their own session. When a later run finds the same packages, targets and advisories, it keeps the decision the maintainer recorded.
- It reads the CI checks once and reports a running check as pending. It never installs or builds the upgrade, and never applies it.
- It posts the full report as a second comment next to the security comment, and a re-run updates both.

A reference job for Renovate pull requests, pinned to a cc-toolkit commit:

```yaml
name: dependency check
on:
  pull_request:
    types: [opened, synchronize, reopened]
permissions:
  contents: read
  issues: write
  pull-requests: write
  checks: read
  actions: read
concurrency:
  group: dep-upgrade-check-${{ github.event.pull_request.number }}
  cancel-in-progress: true
jobs:
  dep-upgrade-check:
    # The pull request's author, not github.actor: a maintainer's push to the branch changes the actor.
    if: >-
      github.event.pull_request.user.login == 'renovate[bot]' &&
      github.event.pull_request.head.ref != 'renovate/lock-file-maintenance'
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v6
        with:
          ref: ${{ github.event.pull_request.base.sha }}
          path: repo
      - uses: actions/checkout@v6
        with:
          repository: grixu/cc-toolkit
          ref: <cc-toolkit commit SHA>
          path: cc-toolkit
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - name: Check the upgrade
        working-directory: repo
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: 1
          GH_TOKEN: ${{ github.token }}
          PR_URL: ${{ github.event.pull_request.html_url }}
        run: |
          pnpm dlx @anthropic-ai/claude-code@<version> -p "/dev-kit:dep-upgrade-check $PR_URL unattended" \
            --plugin-dir ../cc-toolkit/plugins/dev-kit \
            --permission-mode dontAsk \
            --strict-mcp-config \
            --setting-sources user \
            --max-turns 80 \
            --output-format json > ../result.json
          block="$(jq -r .result ../result.json | sed -n '/^```dep-upgrade-check-result/,/^```/p')"
          printf '%s\n' "$block" >> "$GITHUB_STEP_SUMMARY"
          jq -e '(.permission_denials // []) | length == 0' ../result.json
          grep -qx 'status: done' <<< "$block"
          grep -Eqx 'security: (clear|escalated)' <<< "$block"
          grep -Eqx 'decision: (accepted|n/a)' <<< "$block"
```

- Check out the base commit. On `pull_request`, `actions/checkout` defaults to the merge commit, whose lockfile already holds the upgrade. The check reads the current version from the base branch's lockfile either way, but the code it searches should be the base's.
- Keep the plugin checkout outside the repository's directory, or the usage search reads it as part of your code.
- `--permission-mode dontAsk` denies every call the skill does not pre-approve. The pre-approved set covers the pnpm path. For npm, yarn, Python, Go, PHP, Rust, container images or GitHub Actions, add their lookups with `--allowedTools`, or those calls are denied.
- `--strict-mcp-config` and `--setting-sources user` keep the repository's own Claude Code configuration out of the run. Without them, a `.mcp.json` would start its servers on the runner (a stdio server is a command that runs there), and the permission rules in `.claude/settings.json` would widen what the run may do.
- To run on a Claude subscription instead of an API key, set `CLAUDE_CODE_OAUTH_TOKEN` to a token from `claude setup-token` in place of `ANTHROPIC_API_KEY`.
- The last three lines are the gate. The job fails unless the run finished (`status: done`), no unit is blocked, and every escalated unit's decision is `accepted`, carried or fresh; `pending`, `hold`, `switched` and `refresh` fail, since the pull request as opened is not what was approved. The compatibility verdict does not gate: your build and tests already run on the pull request.
- To make the check required before merging, add the job as a required status check on the default branch. A job that its `if:` skips reports success, so pull requests from people and other bots are not blocked. Renovate's lockfile-maintenance pull request is skipped the same way, which keeps its automerge working; it then gets no security check.
- The run reads release notes and guides it cannot trust, and the skill pre-approves commands that reach the network: `gh api` (writes included), the OSV and deps.dev `curl` calls, whose rules match any text after the URL, and `WebFetch` to any domain. A prompt injection in that text can send out whatever those commands can read:
  - `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: 1` strips `ANTHROPIC_API_KEY` and other credentials from the commands' environment and leaves the GitHub token in place, so `gh` keeps working. Keep it.
  - The GitHub token is what `gh api` can act with: grant only the permissions above, and never use `pull_request_target` with a checkout of the pull request's head. Commenting on a pull request takes `pull-requests: write`: with `pull-requests: read`, GitHub refuses the comment with a 403 even when `issues: write` is granted, and the result block's `reason` names the missing permission. With `pull-requests: write`, the token could also approve the pull request if the repository or organization setting **Allow GitHub Actions to create and approve pull requests** were on. It is off by default; keep it off, so that an injected command cannot approve the pull request.
  - Repository code is within reach of `WebFetch`. For a private repository where that matters, add a deny rule such as `--disallowedTools WebFetch`; migration guides then come from the package's repository only.
- Self-hosted Renovate posts under its own bot login; use that in the `if`.
- On a pull request Dependabot opens, the token is read-only unless `permissions` raises it, as above, and only Dependabot secrets are available: store `ANTHROPIC_API_KEY` (or `CLAUDE_CODE_OAUTH_TOKEN`) as a Dependabot secret too.

### pr-open: push the branch and open a pull request

Use it when your commits are ready for review. Add `draft` for a draft pull request, and a branch name to set the base:

```
/dev-kit:pr-open
/dev-kit:pr-open draft develop
```

It pushes the current branch and fills the repository's pull request template. It looks for the template in the repository root, `docs/`, `.github/`, a `PULL_REQUEST_TEMPLATE/` directory, or the owner's `.github` repository, and uses a short default when none exists.

- Every claim in the description comes from the diff, the commits, a linked issue, a command run in the session, or a check you report.
- The change is described in one to three plain sentences and a **Before / After** table, then **Testing:** (including what was not checked), **Reviewer notes:** when something needs a hard look, and **Go deeper:** for the specs and ADRs the branch adds or its commits name. The body fits on one screen, folds long logs into a `<details>` block, and stays valid MDX.
- A ticket field gets the key from the branch, commits or conversation, or `None`. A dependency section lists the deploy steps found in the diff (migrations, infrastructure code, env vars and secrets, permission changes, feature flags, other repositories' pull requests), or `- None`. Work the base already has, such as a squash-merged commit, is left out.
- It ticks a checkbox only when it has evidence that the item is true.
- It writes a Conventional Commits title when the base branch's history uses that style, ending with the ticket key in parentheses when the history does that too.
- It assigns the pull request to you.
- When your branch builds on another open pull request's branch, it targets that branch. When it also carries a second open pull request's commits that the target does not contain, the report and the description name that pull request and say its commits show in the diff until it merges.
- When a pull request already exists, it pushes and reports the pull request. It rewrites the description only when you ask for that, and otherwise mentions the option in one line. A rewrite edits the current description: your own sentences, bot lines, extra sections such as `## Code story` and the tracker's link line at the end stay as they are.
- With a TypeSafe key configured, it assesses the branch's risk, ends the description with a **Risk** section, and labels the pull request with the level, such as `risk: high`. On an existing pull request it swaps the old risk label for the new one and refreshes the description's **Risk** section, leaving the rest of the description as it is. Without a key, nothing is sent and the report says the risk was not assessed.
- When the [pr-proof](../pr-proof/README.md) plugin's skills have left proof for the branch, it adds a **Proof** section just before **Risk**. See [Proof](#proof-from-pr-proof).

When the base has moved ahead, it reports how far behind the branch is and whether a merge would conflict, opens the pull request as it stands, and offers the sync as a separate step. It never commits, merges, rebases or force-pushes, and running it counts as the per-branch push consent a repository rule may require. It stops on the default branch or a detached HEAD, and asks what to do when tracked files have uncommitted changes; untracked files stay out of the pull request and are listed in the report.

Output: the pull request URL, its base branch, the template it used, the sections and checkboxes left for you to complete, the risk level and label (or why it was not assessed), the proof entries it rendered or left out and anything that failed to upload, and a one-line suggestion to run `pr-shepherd` next.

#### Proof from pr-proof

The pr-proof plugin's skills (videos, screenshots, terminal transcripts, API calls) record what they took in a manifest, `~/.cache/pr-proof/<repo>/<branch>/manifest.json`, where `<repo>` is the name of the `origin` remote and `<branch>` the current branch with `/` written as `%2F`. `pr-open` only reads that file; it needs no other part of pr-proof installed.

- No manifest means no **Proof** section. A manifest that does not parse, or has a `version` other than `1`, is ignored, and the report says so. An empty list of entries means proof was judged unnecessary: no section.
- Each entry renders in manifest order as its claim, then its proof: screenshots taken at several widths as a table with a row per screen and a column per width, a video or a single image on its own line, a terminal or API transcript as a code block, folded into `<details>` past 20 lines.
- When commits after an entry's proof changed the files it covers, the entry carries a note naming those commits. When history was rewritten since a proof was taken, one note under the heading says so.
- An entry whose media or transcript file is missing is left out and named in the report.
- The media are attached with `gh --attach`, so the description holds GitHub's `user-attachments` URLs. `pr-open` re-reads the description after the upload and reports anything that did not upload.
- More than 50 media files: the description carries the first 50 and says how many follow; the rest go in comments of at most 50 each, marked `<!-- pr-proof:overflow -->`. On every run it first deletes your earlier marked comments, and leaves every other comment alone.
- On an existing pull request it replaces the **Proof** section, inserts it when the description has none, or removes it when the manifest's list is empty. With no manifest, the section and its comments stay as they are.
- The section does not count toward the one-screen length budget.

## Risk assessment (TypeSafe Jev)

dev-kit includes a mod that gives Claude the `pr_risk` tool (`mcp__dev-kit__pr_risk`). It groups the changed files of `<base>...HEAD` into slices, one per purpose of the change, and asks [TypeSafe's Jev model](https://docs.typesafe.ai/introduction) fixed questions about each slice: the impact of a mistake, how complex the logic is, what the slice does, and which risky areas it touches. Code turns the answers into a level (`low`, `medium`, `high` or `critical`) and risk flags: security, persisted data, public contracts, CI and infrastructure, and logic without tests. `pr-open` calls it; Claude can also call it when you ask how risky a branch is. There is no slash command.

**The diff, the commit messages and the pull request and ticket descriptions passed as `context` leave your machine.** The tool exists only when a key is configured, so without one nothing is sent.

Set the key in one of two ways:

- Export `TYPESAFE_API_KEY` in the shell you start Claude Code from (the default).
- Or enter it as the plugin's **TypeSafe API key** option (`/plugin configure dev-kit@cc-toolkit`), which Claude Code keeps in your system's credential store. It takes precedence over the variable.

A key set or changed during a session takes effect after `/reload-plugins`.

[The risk label](https://cct.grixu.dev/plugins/dev-kit/risk-assessment/) explains what the **Risk** section shows, [How it works](https://cct.grixu.dev/plugins/dev-kit/risk-assessment/how-it-works/) how a level is computed, [Reliability](https://cct.grixu.dev/plugins/dev-kit/risk-assessment/reliability/) what partial and low-confidence results mean, and the [Risk label reference](https://cct.grixu.dev/plugins/dev-kit/risk-assessment/reference/) every option, input and output field. The [evaluation guide](evals/pr-risk/README.md) explains how the scorer is measured.

## Permissions

Each skill pre-approves only some of the commands it runs. Anything else asks for permission unless your settings already allow it:

| Skill | Pre-approved | Still asks |
|---|---|---|
| `ci-fix` | File edits; `git status`, `fetch`, `switch`, `log`, `diff`, `show`, `add`, `commit`, `push`; `gh run view`, `list`, `rerun`; `gh pr checks`, `checkout` | `gh api` (checks from third-party apps); your test, lint and build commands |
| `pr-shepherd` | File edits; `git status`, `fetch`, `rev-list`, `pull --ff-only`, `log`, `diff`, `merge-tree`, `merge`, `worktree`, `add`, `commit`, `push`; `gh pr view`, `checks`, `comment`; `gh api graphql`; `ci-fix` | Your test and lint commands |
| `dep-upgrade-check` | Writing files (the advisory query and the comment bodies); `printenv GITHUB_ACTIONS`; `git fetch`, `show`; `gh repo view`; `gh pr view`, `diff`, `checks`; `gh run view`; `gh api`, writes included (changelog files, commit ranges, advisories, the comments' lookup, creation and update); `gh release list`, `view`; `pnpm view`, `why`, `list`; `npm diff`; `curl -s` to api.osv.dev and api.deps.dev; WebFetch; firecrawl search and scrape; context7 | Lookups for npm, yarn, Python, Go, PHP, Rust, container images and GitHub Actions; the optional worktree build |
| `pr-open` | Nothing | Every `git` and `gh` command |

An unattended `pr-shepherd` loop pauses at the first permission prompt. Before you start it, allow your repository's check commands in `.claude/settings.json`, for example `"Bash(pnpm test *)"`.

## Advanced

- `ci-fix` accepts the extra argument `push-authorized`. It then pushes without asking and ends with status `blocked` wherever it would otherwise ask you. `pr-shepherd` calls it this way.
- `dep-upgrade-check` accepts the extra argument `unattended`, and `GITHUB_ACTIONS=true` has the same effect. It then asks nothing, ends with status `stopped` wherever it would otherwise ask you, and posts its full report on a pull request. See [Unattended, in CI](#unattended-in-ci).
- `pr-shepherd` accepts an `iteration` argument after any pull request numbers. The loop passes it; you do not need to.
- `skills/dep-upgrade-check/bot-prs.md`, `ecosystems.md` and `security.md` are reference files the skill reads, not commands.
