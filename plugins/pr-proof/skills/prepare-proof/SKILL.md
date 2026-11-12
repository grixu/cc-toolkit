---
name: prepare-proof
description: Plan and produce the proof a branch's pull request needs. Judges each proof kind (video, screenshots, terminal, API, or none) from the diff with decision-model signals (TypeSafe Jev or Gemini Decision) when available, confirms the whole plan once, brings up the app's stack, runs walkthrough-video, screenshot-proof and terminal-proof in order, and records the result in the branch's proof manifest for pr-open. Use when asked to prepare, plan or gather proof for a PR or branch, or to work out which proof a change needs, whether the user asks directly or another agent dispatches it.
---

`/pr-proof:prepare-proof [base] [before]`

You decide which proof a branch needs, confirm it with the user once, own the app's stack for the whole run, and hand each kind to its executor. Executors never start, seed or stop a stack; you do.

Read `${CLAUDE_SKILL_DIR}/../../references/rules.md` first. Its rules bind every step below, and it holds the manifest path, schema, `jq` write recipe, approval rule and agent-caller block this skill names.

## Inputs

- **`base`**: the branch the change merges into. Default: the repository's default branch, `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`.
- **`before`**: present only when the user asks for "before" screenshots. It passes through to `screenshot-proof`.

Work dir: the manifest's directory, `~/.cache/pr-proof/<repo>/<branch>/`, computed as the rules' manifest section shows. Create it with `mkdir -p`.

## Steps

1. **Refuse** on the default branch or a detached HEAD: the manifest path needs a branch, and there is no change to prove.
2. **Signals.** Look up `mcp__pr-proof__proof_signals` with tool search and call it with `base`. When the tool is absent, or its result starts `Proof signals unavailable:`, judge from the diff alone and note "signals not used" with the reason for the report. A result with `coverage.partial` true assessed only part of the diff; read the rest yourself.
   - A result starting `Backend choice needed:` means both a TypeSafe and a Gemini key are set and no backend is configured. Ask the user in one question whether to use TypeSafe, Gemini or both, then call the tool again with `backend` set to `typesafe`, `gemini` or `both`. Under an agent caller, this question is a `Confirmation needed` block of its own, before the plan. The report suggests saving the answer as the pr-proof option `decision_backend` in `/config`.
   - The result's `backend` and `model` name who answered. With `comparison`, every backend's signals sit there, one entry per backend, or its `error`; the top-level signals are the primary backend's. A kind on which two backends disagree, one `suggest` and the other `reject`, counts as `uncertain`.
3. **Judge each kind** on its own, as the next section says, then set the signals beside your decisions:
   - A kind whose signal is `suggest` that you do not plan, or whose signal is `reject` that you do plan, is an overrule: state its reason in one line.
   - `uncertain` is your call.
   - The terminal question also counts what a test run prints, so a `suggest` for `terminal` that comes only from test changes is an expected overrule: tests never call for a kind by themselves.
   - `suppressed` true means the backend reads the change as not affecting program behaviour. Planning any kind against it is an overrule too.

   When no kind applies, the plan is **no proof**.
4. **Assign files.** Give each planned kind the diff's files it proves (`git diff --name-only "origin/$base...HEAD"`, or `"$base...HEAD"` when origin has no such branch). A file may serve several kinds. The executors confirm and correct them.
5. **Confirm the plan once.** Show the whole plan in the user's language and wait for a yes or corrections:
   - each kind, planned or not, with its reason, its signal and any overrule, and with `comparison` each backend's signal beside it;
   - each planned kind's `files`;
   - what will run, in order: `terminal-proof terminal`, `terminal-proof api`, `screenshot-proof`, `walkthrough-video record-only`;
   - whether a stack is needed, and whether one for this checkout is already up or will be started.

   With `before`, the same question asks where the base comes from:
   - the URL of a stack already running at `base`;
   - a second stack you start from a temporary worktree of `base`, which the plan names: `~/.cache/pr-proof/<repo>/<branch>/base-worktree`;
   - neither, so the before shots are skipped.

   Under an agent caller, end your turn with a `Confirmation needed` block as the rules' agent-caller section says, and continue when the caller resumes you with the answers. Ask nothing else before producing proof: this is the one confirmation of the plan.

   For **no proof**, the yes takes you straight to step 8.
6. **Stack.** Only when a planned kind needs the running app: `screenshots` and `video` always do, `api` always does, `terminal` when the command it runs talks to the app. With none of those planned, start nothing.
   - Take how the stack runs, how it is seeded, which actions reach shared services, and where the test users' credentials live from the project's `CLAUDE.md` files.
   - Reuse a stack already up for this checkout: its health URL answers, or its containers belong to this checkout. A reused stack is not yours to stop; you will ask nothing about it.
   - Otherwise start it detached, seed it under the rules' shared-data rule, and wait for readiness with a bounded loop, as the rules' waiting rule says. Record that this run started it.
   - A stack that does not come up fails each kind that needs it, and the report names the failure. The kinds that do not need it still run.

   **Second stack for `before`**, when the user chose it:
   - Resolve the commit: `origin/<base>`, or `<base>` when origin has no such branch.
   - The worktree path is `~/.cache/pr-proof/<repo>/<branch>/base-worktree`. Reuse a worktree an earlier run left there only when `git worktree list --porcelain` registers that path in this repository and `git -C <path> rev-parse HEAD` prints that commit.
   - Otherwise, when the path is registered here, clear it with `git worktree remove --force <path>`, leaving alone any stack still running from it (rules: other stacks are off limits). Then `git worktree add --detach <path> <commit>`.
   - A path occupied but not registered here, which another clone of the same name can leave, makes the add fail. That counts as a base stack that does not come up.
   - A fresh worktree has no untracked env files: give it its own dependency install and env, taken the project's own way. Start it on ports that do not clash with the first stack, seed it under the rules' shared-data rule, and wait for readiness.
   - A base stack that does not come up, or a `before` with no base URL and no second stack, drops only the before shots: do not pass `before` on, and say so in the report. The after shots go on.
7. **Run the executors** with the Skill tool, in this order, each only when planned and its stack is up:
   1. `pr-proof:terminal-proof terminal`, then `pr-proof:terminal-proof api`;
   2. `pr-proof:screenshot-proof`, with `before` and the base stack's URL when they survived step 6;
   3. `pr-proof:walkthrough-video` with `record-only`.

   Pass each one the app's URLs, where the credentials live (a path or a source, never a value), that kind's `files` and the run's `base`. Pass `walkthrough-video` the branch as the feature and the plan's reason for video as what the viewer should see.

   `terminal-proof` and `screenshot-proof` write their own manifest entries. A kind that fails, is dropped or is rejected is recorded for the report, and the rest go on; never write an entry for it.

   Under an agent caller, an executor's `Confirmation needed` block goes back to your caller as your own, and you resume the executor's step with the answers.
8. **Write your entries** with the rules' `jq` recipe, `$base` set to the run's `base`:
   - **Video**, once `walkthrough-video` reports an accepted video: `<work dir>/entry.json` holds `{"kind": "video", "claim": "<one sentence: what the video shows the change doing>", "files": [<the files it reported>], "media": [{"path": "<the MP4's absolute path>"}]}`. No accepted video, no entry.
   - **No proof**: write the manifest with `entries: []` as the rules show.
9. **Report**, in the user's language:
   - which backend answered, or both, and why no signals were used when none were;
   - each kind with its reason, its signal and any overrule;
   - each failure, dropped entry or rejected proof, and the before shots skipped and why;
   - each executor's corrections to `files`;
   - the manifest path;
   - that `pr-open` must run for the proof to appear in the PR.

   Then ask before stopping any stack this run started, naming each one. Stopping the base stack also removes its worktree with `git worktree remove --force <path>`, because the install and env files leave it unclean. Under an agent caller this question goes in a `Confirmation needed` block. Ask nothing about a stack you reused.

## Judging the proof kinds

Proof shows a reviewer that the change does what it claims, in a form they can check without running it. Decide each of the four kinds on its own, from the commits, the diffstat and the diff of `<base>...HEAD`. Tests the change adds or edits are not proof and never call for a kind by themselves.

- **screenshots**: the change alters how a screen looks at rest: layout, styling, spacing, visible text, a new or changed component, page or state, or the rendering of an email. One still image per state can show it.
- **video**: the change alters something a user does across steps in the UI: a new or changed flow, or an interaction whose result appears only after input such as a click, typing, pasting or a choice in a dialog. A still image of one state cannot show it.
- **api**: the change alters what an HTTP or RPC endpoint returns to its caller: status, body, fields, error code or headers, which callers may read or write it, or a file a site serves.
- **terminal**: the change alters what a command, script, migration, job, build or a log line prints or does when run from a terminal.

Choose **no proof** when the change does not affect program behaviour: documentation and its content, agent instructions and rules, comments, refactors that keep behaviour, dead-code removal, version bumps and changelogs, and local toolchain pins.

A change can need several kinds: a page that also changes the endpoint behind it needs screenshots and api. A visual change that also adds a flow needs screenshots and video. Pick each kind the change itself shows, not kinds a reviewer could gather about unchanged code nearby. When a kind is doubtful, decide from what the diff changes, not from the commit messages' claims.

State each decision with a one-line reason.
