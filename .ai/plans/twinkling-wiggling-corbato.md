# fd3 real-runs eval data in the repo, with one shared R2 script

## Context

fd3 is about to change a lot (build-spec, split-to-tasks, then implement). Before that, its eval set needs
real runs to confirm the change improves results. The raw collection in `~/.claude/fd3-eval-dataset/`
covers 15 runs. The user wants only fd3 ≥ 0.4, with responses-api and impersonation (console-monorepo) the
most important. They also want repo snapshots, the data inside this repo but git-ignored, and a copy in R2
through one script in `package.json` that every plugin can use. User decisions: full transcripts go in
unmasked; the shared script replaces code-review's two `data.mjs` now; pr-risk keeps its own, because it
builds sets from picked files.

## Steps

### Dataset (git-ignored, `plugins/fd3/evals/real-runs/local/`, already covered by `plugins/*/evals/*/local/`)

- [x] Rebuild with the fixed collector (failed Write/Edit calls skipped, so the user-flags and calendar task sets
  are complete), limited to the 7 cases on 0.4+: bnm-405, calendar consultation-booking, user-flags,
  response-body-stripping, nested-fields-and-errors, impersonation, responses-api.
- [x] Per case: `manifest.json`, `sessions/<stage>-<id>/` (conversation, file-ops, `written/`, `spec-as-read.md`),
  `git/` snapshots, `disk/` copies (incl. `*.session/`).
- [x] Repo snapshots: `repos/<repo>@<sha>.tar.gz` (`git archive`) at the confirmed base. The bases were checked in
  the build transcripts: bnm-405 `2001bbb`, calendar `a8dc35c` (8th commit, the repo was new), user-flags
  `a4cb505`, response-body-stripping `6017189`, nested-fields `d52fde9`, impersonation `0dd6abb`, responses-api `8b8be5e`. Add
  `cloud-terraform-internal-services` at its `main` before the impersonation build start, because its tasks
  land there. console-monorepo is ≈18 MB per archive.
- [x] Transcripts: copy each case's session jsonl and its subagents folder unchanged to `transcripts/<id>/`.
- [x] Completeness check printed per case: task count at split vs the split report's task list, spec read with
  no gaps, snapshot present for each repo the tasks name. Any gap goes into the README.
- [x] `local/README.md` (case table, layout, caveats), `local/cases.jsonl`, `local/scripts/` (collector + case map).
  Then delete `~/.claude/fd3-eval-dataset/`, which this session made. The 8 pre-0.4 cases are dropped, as asked.

### Shared R2 script

- [x] `scripts/eval-data.mjs push|pull|list [target…]`. A target is `<plugin>` or `<plugin>/<suite>`, resolved to
  `plugins/<plugin>/evals[/<suite>]/eval-data.json`; no target means every such file. That file is committed
  and holds `{ prefix, root, paths, sha256 }`. Key = `<prefix>/<sha256>.tar.gz` (the scheme code-review already uses).
  - push: tar `paths` from `root`, hash, upload, write `sha256` back into `eval-data.json`.
  - pull: skip when the marker `.eval-data-sha` beside the config matches. Otherwise download, verify the hash,
    move the current `paths` to `.eval-data-prev-<old>-<ts>/` and untar. These are the rules of
    `plugins/code-review/evals/data.mjs`, reused.
  - list: `aws s3 ls` under the prefix. Same env (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
    `R2_BUCKET`) and aws CLI calls as the existing `r2()` helper.
- [x] `package.json`: `"eval:data": "node scripts/eval-data.mjs"` → `pnpm eval:data pull fd3/real-runs`.
- [x] `.gitignore`: replace `.fixtures-*` with `plugins/*/evals/**/.eval-data-*`.

### Migration

- [x] code-review fixtures: `plugins/code-review/evals/eval-data.json` (prefix `code-review/fixtures`, paths
  `cases comment-track scope-mix`, sha256 from `fixtures.sha256`, so no re-upload is needed). Delete `data.mjs`
  and `fixtures.sha256`. `reset-sandbox.sh` calls `node ../../../scripts/eval-data.mjs pull code-review`.
- [x] apply-decision: `evals/apply-decision/eval-data.json` (prefix `code-review/apply-decision`, root `local`,
  `paths: ["."]`). Delete `data.mjs`. The R2 object changes from `v1/local.tar.gz` to a content-addressed key,
  so the owner re-pushes it once (`pnpm eval:data push code-review/apply-decision`). Until then `sha256` is empty and pull says so.
- [x] fd3: `plugins/fd3/evals/real-runs/eval-data.json` (prefix `fd3/real-runs`, root `local`) and a public
  `README.md` naming no case (how to pull, layout, what each stage is evaluated from).
- [x] Docs: the code-review evals README (lines 23–24, 48–59), the apply-decision README (44–50), and
  `.claude/rules/evals.md` (private data goes through `pnpm eval:data`, and pr-risk keeps its own `data.mjs`).
  CHANGELOG `[Unreleased]` lines for code-review (evals data moved to the shared script) and fd3 (real-runs suite).

## Verification

- `node scripts/eval-data.mjs` with no R2 env fails, naming the missing variables. An unknown target fails, naming the
  configs it found.
- Run locally without R2, using a temporary stub `aws` on PATH that copies to a scratch dir (not committed): push, then pull into a
  clean copy. That gives the same tree, the marker is set, a second pull is skipped, and a changed pin moves the old tree to a backup.
- `bash -n` plus ShellCheck on `reset-sandbox.sh`, then `node scripts/verify-plugins.mjs` (the `verify` skill).
- `git status --ignored`: nothing under `real-runs/local/` is tracked, and `git check-ignore` covers the markers.
- Real R2 (needs the user's env, so the user runs it with `!`): `pnpm eval:data push fd3/real-runs`,
  `pnpm eval:data push code-review/apply-decision`, then `pnpm eval:data pull code-review` to prove the migrated pin
  still resolves.

Nothing is committed without being asked. Once approved, the code goes on a branch, split into surgical commits
(script + package.json; code-review migration; fd3 suite + rule).
