# Harness and context fixes from the 2026-11 session retro

Nine retro agents read 1,200 Claude Code sessions of this repo (main checkout, 20 worktrees, eval
sandboxes, 2026-09-28 → 11-17). The largest costs come from the user-global hooks and from checks
that never run, not from CLAUDE.md wording. This plan fixes them in six steps, cheapest and widest
first. Report and per-group evidence: scratchpad `RETRO-REPORT.md` and `findings/g1…g9-*.md`
(session `33ada36f`; `/private/tmp` is wiped on reboot, so step 0 keeps a copy).

Owner decisions (2026-11-17): the shell stays zsh everywhere (no `CLAUDE_CODE_SHELL`); the agent may
run the `release` skill itself, still only when asked; "merge" means `gh pr merge --admin` without
asking.

## Facts this plan rests on

- `~/.ccs/shared/{settings.json,CLAUDE.md,rules,…}` are symlinks into `~/.claude/`, so each user-global
  file has one copy. `~/.claude` is not a git repo: step 1 edits are unversioned; keep a `.bak`.
- Hook docs (code.claude.com/docs/en/hooks): on exit 0 "Claude never sees stderr"; PostToolUse feedback
  needs exit 2 (stderr) or JSON `additionalContext` / `decision: "block"`.
- `cbm-bash-search-gate` blocks grep/awk/sed even on one named file, and `is_indexed()` never asks git
  whether a path is ignored, so git-ignored folders (`plugins/dev-kit/evals/pr-risk/local/**`,
  `.ai/specs/*/*.session/`) are blocked though CBM has nothing there. ~300 blocks across all groups;
  g1 replayed 103 against today's hook: all still blocked. Its message never says the whole compound
  command was dropped.
- `cbm-hook-augment` is wired to PreToolUse `Grep|Glob|Bash`; on Bash it injected ~180k tokens of
  unrelated symbols in one session (g1: 755 injections).
- False positives, with the pattern at fault:
  - `protect-secrets.js:111` `xargs.*cat` (matches "lo**cat**ion").
  - `protect-secrets.js:112` `find.*-exec.*(cat|less)` (no `.env` needed; matches "head**less**").
  - `block-dangerous-commands.js:51` echo-secret `.+` crosses `;`/`&&`, which blocks the form tool-hygiene prescribes.
  - `block-dangerous-commands.js:49` cat-secrets fires on the memory file `pr-risk-secrets-file.md`.
  - `block-dangerous-commands.js:33` rm-system fires on `docker run --rm … /var/folders`.
- Repo `.claude/settings.json` ShellCheck hook ends in `2>/dev/null || true`: two red CI runs (PR #20, #27).
- `.claude/skills/release/SKILL.md` has `disable-model-invocation: true`; agents piped `y`/`n` into
  `release.sh`, pushed `HEAD:main` by hand, released from the main checkout (6 groups).
  `release.sh:22` says no inter-plugin dependencies exist; code-story and dev-kit declare them.
- `lint.yml` runs only shellcheck and `check-codex-plugins.sh`; no workflow runs
  `claude plugin validate` / `claude plugin test`; `/verify` ran ~1 time per 66 commits; its checker
  is Python pasted in the skill. `plugins/fd3/evals/CLAUDE.md` exists against the repo rule.
- 29 `fixup!` commits reached `main` since 10-01.

## Steps

### 0. Keep the evidence

- [x] Copy `RETRO-REPORT.md` to `.ai/plans/harness-retro-2026-11-report.md` and commit it with step 2.
  (copied; commit lands with step 2)

### 1. User-global hooks and steering (outside the repo, no commit)

Before editing, back up each file to `<file>.bak-retro-20261117`.

- [x] Build a replay corpus in the scratchpad: from the session transcripts, every Bash `tool_use`
  whose result was a block by `cbm-bash-search-gate`, `protect-secrets` or `block-dangerous-commands`,
  with its `cwd`. Add must-block controls: `grep -rn foo plugins/`, `rg foo`, `git grep foo`,
  `cat .env`, `find . -name .env -exec cat {} \;`, `echo $API_KEY`, `rm -rf /usr/x`, `rm -rf ~`.
  Record today's verdicts.
- [x] `~/.claude/hooks/cbm-bash-search-gate`:
  - allow a grep/awk/sed/`cat|grep` step whose operands are all existing regular files and that has no
    `-r/-R/--recursive` (a lookup in a named file, not a search); (changed: up to 8 files, globs
    expanded; recursion flags don't matter once every operand is a file)
  - `is_indexed()`: treat a path as not indexed when `git -C <root> check-ignore -q <path>` succeeds
    (run only for paths about to be blocked);
  - `MSG_SEARCH`/`MSG_RELATIONAL`: open with "The whole command did not run — rerun its other steps
    on their own"; name `get_file_outline` and Read with `offset` for one file; for a `sed -i` step,
    say "use Edit".
- [x] `~/.claude/settings.json`: PreToolUse `cbm-hook-augment` matcher `Grep|Glob|Bash` → `Grep|Glob`.
- [x] `~/.claude/hooks/protect-secrets.js`:
  - `xargs-cat-env` → require `.env` and whole-word `cat|less` within one segment;
  - `find-exec-cat-env` → `\bfind\b[^;&|\n]*\.env\b[^;&|\n]*-exec\b`.
- [x] `~/.claude/hooks/block-dangerous-commands.js`:
  - `echo-secret`: `.+` → `[^;&|\n]*`;
  - `cat-secrets`: skip `*.md`/`*.mdx` names;
  - `rm-*`: `rm` in command position only (segment start or after `sudo|xargs|command|exec`), so
    `--rm` never matches; (added: arguments stay inside one command — `(-.+\s+)*` had reached a
    later `< /dev/null` or `| /usr/bin/grep`)
  - `rm-system`: `var(?!/folders)`.
- [x] `~/.claude/tool-hygiene.md`:
  - honest header: mark which lines a hook enforces;
  - code-search line: "Repo-wide search: codebase-memory. grep is fine on a named file and on files
    outside the index. Keep a search in its own Bash call. A hook-blocked command never passes on
    retry — rewrite it";
  - secrets line: exact form `test -n "$VAR" && echo set || echo unset` (the name appears only in the
    test);
  - new zsh line: user aliases (`ls`→eza, `diff`→git diff, `g`, `gk`); a `$VAR` holding a command does
    not word-split, so write it inline; never name a variable `path`; an unmatched glob aborts the
    command; a word starting with `=` is expanded (`echo ====` fails).
- [x] `~/.claude/CLAUDE.md`:
  - "Code exploration": align with the new gate (no contradiction with tool-hygiene);
  - "How I work": "Look facts up with tools (gh, spacectl, the code, a subagent) before asking; ask
    only for decisions. Before handing me manual work, say why the inputs can't settle it." and "In
    questions and follow-ups, lead each item with the effect I'd notice, define coined terms, and link
    every PR, issue or file you ask me to look at.";
  - "1Password": "Two accounts are signed in; pass `--account my.1password.com` to every `op` call."
- [x] Re-run the corpus: every control is still blocked; named-file lookups, git-ignored paths and
  the false-positive cases pass. Report before/after counts.
  (674 commands + 32 controls, all controls correct. Still blocked before → after: gate 434 → 355
  of 551, the rest being recursive repo searches or files that no longer exist; dangerous 34 → 7;
  secrets 55 → 32, the rest being env dumps, `secrets.sh` and `.env` inside heredocs, as intended.)

### 2. Repo PR "harness" (branch `chore/harness-retro` from `origin/main`)

- [x] `.claude/settings.json` ShellCheck hook: `case "$f" in *.sh) shellcheck "$f" >&2 || exit 2 ;; esac`,
  no `|| true`. (added: exits 0 when shellcheck is not installed)
- [x] `.claude/skills/release/SKILL.md`: drop `disable-model-invocation`; description says "only when
  the user asks for a release"; preflight from `git worktree add --detach <tmp> origin/main`,
  `CI=true ./scripts/release.sh`; add the all-unreleased branch (`### Added` → minor, else patch, one
  at a time, stop on first failure).
- [x] `scripts/release.sh`: `git fetch` and die unless `HEAD` equals `origin/main`; push with
  `git push origin HEAD:main` and its tag; fix the line-22 comment on dependencies. Run `shellcheck`.
  (added: the script resolves the repo from its own path and `cd`s there, so
  `<worktree>/scripts/release.sh` works from any directory)
- [x] `CLAUDE.md`:
  - "Releasing": release only when asked, via the `release` skill;
  - add "`main` is protected: when the user says merge, run `gh pr merge <n> --merge --admin --delete-branch`";
  - drop "Always propose a plan…" (duplicates global Plan first) and "Requires jq and git…";
  - turn "Always read the current plugin documentation" into a pointer to
    `code.claude.com/docs/llms.txt`, "scrape each page once to the scratchpad, then grep it".
- [x] New path-scoped rules (format of `.claude/rules/tester.md`):
  (changed: `plugins/fd3/evals/CLAUDE.md` moved whole to `fd3-evals.md` scoped to
  `plugins/fd3/evals/**`, so its 200 lines load where they did before; `fd3.md` stays short)
  - `docs.md` (`docs/**`, `brand/**`): `docs/DESIGN.md` is the source of truth; EN and `pl/` twins
    change together; anti-slop on new prose before commit; the build already checks links.
  - `evals.md` (`plugins/*/evals/**`, `scripts/run-evals.sh`): run through `scripts/run-evals.sh`;
    experiment scripts in `evals/<suite>/local/<experiment>/` with each launch command and output path
    in its `RUNS.md` before the run; private fixtures and traces only through R2 (`evals/data.mjs`),
    never git or public CI artifacts.
  - `fd3.md` (`plugins/fd3/**`): check workflow scripts with
    `node --test 'plugins/fd3/tests/workflows/*.test.mjs'`, not `node --check`; outline big workflow
    files with `get_file_outline` and Read by offset; absorb `plugins/fd3/evals/CLAUDE.md`, then delete
    that file.
- [x] Check the `.claude/rules/code-story.md` claim that the test runner refuses `node:*` imports
  against `plugins/code-review/tests/register.test.ts`; correct whichever is wrong.
  (no change: the rule is about modules under test; test files may import `node:test`, and no
  `hooks/*.ts` imports `node:*`)
- [x] Add `.agentkit/` to `.gitignore`.
- [x] PR via `dev-kit:pr-open`, shepherd to green, merge with `--admin`. (#64, squash-merged as
  49c95c62 after five review fixes)

Steps 3–5 landed on `chore/harness-retro` (PR #64) instead of separate branches, by the owner's
2026-11-18 go-ahead to keep one branch.

### 3. Repo PR "checks"

- [x] Move the checker out of `.claude/skills/verify/SKILL.md` into `scripts/verify-plugins.mjs`
  (Node, per the Bash > Node > Python rule). Add:
  - each description is at most two sentences and identical in `plugin.json` and `marketplace.json`;
  - no `CLAUDE.md` anywhere in a plugin tree except under `fixtures/`;
  - `cmp` of the hand-copied `hooks/decision.ts` and `providers/*` sets across plugins.
  (each check proven on a deliberately broken temp worktree)
- [x] Reduce the `verify` skill to running the script and judging what it cannot.
- [x] `lint.yml`: a `verify-plugins` job; a job that installs Claude Code at the version
  `plugin-evals.yml` pins and runs `claude plugin validate` and `claude plugin test` for every plugin
  the PR changed. (changed: `validate` without `--strict`, which fails four plugins on mod TypeScript
  warnings; code-review's two test files were rewritten from `node:assert` to `claude-code/testing`,
  since `claude plugin test` had never been able to load them)
- [x] Add a CI check that fails a PR containing `fixup!` commits. (reverted after review on #64: PRs
  #57–#63 landed as squash commits, so merging switched to `--squash`, which keeps `fixup!` commits
  off `main` and makes the check redundant)
- [x] `CLAUDE.md`, one "Checks:" line with these commands; mod code has no tsc or tsconfig.
- [x] PR, shepherd, merge. (in #64)

### 4. Eval harness

- [x] Baseline: `work-g9/agg.mjs` and the per-group evidence are kept, git-ignored, in
  `.ai/specs/harness-retro/retro.session/` (changed: not copied into a plugin's `evals/`; it reads
  session transcripts, not eval output).
- [x] `scripts/evals-isolation.json`: narrow the `~/.ccs` block. (changed: not a file list, which would
  miss the next secret a ccs profile adds. Probes showed a `credentials.files` deny cannot be re-opened
  and `allowRead` takes only literal paths, so `run-evals.sh` writes a git-ignored
  `scripts/.evals-isolation.host.json` that moves `~/.ccs`/`~/.claude` to `filesystem.denyRead` and
  re-opens only this checkout's project dirs. Probe: a saved tool result reads from Bash; `~/.ccs`
  secrets and other projects' transcripts stay denied. In #66)
- [x] code-review isolation. (changed: `working_dir` stays at the repo root, so the ~20 prompts keep
  their paths; the host copy denies this checkout's `CLAUDE.md`, `AGENTS.md` and `.claude/` to Bash and
  Read instead. Probe: all three denied. The before/after eval needs the R2 fixtures, which need the
  owner's 1Password; see the PR. In #66)
- [x] `TMPDIR`: a probe in the real eval sandbox showed it already points inside the sandbox; the
  failures came from `mktemp -t`, which ignores `$TMPDIR` on macOS. Fixed at the source in dev-kit
  pr-open (step 5) instead of in `run-evals.sh`. `npm_config_cache` and the `push -u` upstream: not
  changed (2 and 4 hits, no run blocked; g9 advised leaving them).
- [x] Re-run: dev-kit `pr-open-feature|pr-open-proof` after the pr-open fix. `mktemp` now succeeds in
  the sandbox; feature passed; proof failed because the agent collected `--attach` flags in `$A`,
  which zsh passes as one word. pr-open now says to write each flag out; proof re-run passed (1/1,
  $1.09). `git push -u` still cannot write `.git/config` (push itself succeeds).
  zsh errors stay by the owner's shell decision; `echo ====` no longer fails, since Claude Code now
  runs zsh with `NO_EQUALS`; unmatched globs still abort.

### 5. Plugin fixes

- [x] dev-kit `skills/pr-shepherd/SKILL.md`: `gh pr checks` exits non-zero while checks are pending or
  none are required; read the JSON, never chain it with `&&`. (added: pr-open `mktemp -d
  "${TMPDIR:-/tmp}/…"`)
- [x] fd3 `skills/split-to-tasks/SKILL.md:107-115`: an unchanged cited text whose line numbers moved
  clears; update the pins and name them in the report. (changed: the tasks cite the new lines and the
  spec stays as it is, since only build-spec may edit a spec)
- [x] Each: `CHANGELOG.md` `[Unreleased]`, merge, then the `release` skill. (dev-kit 0.12.1, fd3
  0.5.5, both released through the skill from a detached `origin/main` worktree)

### 6. Memory

- [x] New reference memory: launch recipes for `codex exec`, `ccs mm`/`ccs zai` and agy, taken from
  the g1 session (`cced5ee1`) where they were rebuilt four times. (agy: no working launch was ever
  recorded; the note says so)
- [x] `docs-site-line-map-decision.md`: replace "Look" with a pointer to `docs/DESIGN.md`; drop
  `/proto/site`.
- [x] Rename `pr-risk-secrets-file.md` → `pr-risk-credentials-runbook.md` and its index line (the old
  name trips the secrets hook).
- [x] Shorten every `MEMORY.md` line to a one-line pointer.

## Verification

- Step 1: corpus replay before/after (every control still blocked; listed false positives pass), plus
  a live check in a new session: `grep -n release scripts/release.sh` passes, `grep -rn release plugins/`
  is blocked with the new message, `docker run --rm alpine true` is not blocked.
- Step 2: edit a `.sh` with a known SC2015 and see the finding reach the model; `CI=true` release dry
  path from a detached worktree refuses when `HEAD` ≠ `origin/main`; path rules load (open a file
  under `docs/` and check the rule appears).
- Step 3: the new jobs pass on the PR and fail on a deliberately broken branch (description of three
  sentences, a stray `CLAUDE.md`, a diverged `decision.ts`, a `fixup!` commit).
- Step 4: cluster counts against the baseline.
- Whole plan: in two weeks, rerun the retro aggregation over new sessions; compare gate blocks, hook
  false positives and `/verify`-type misses with this baseline.
