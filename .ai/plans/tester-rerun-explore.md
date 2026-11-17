# tester: kept runs, `--rerun`, and an exploratory suite

Builds on the Doctor gate (branch `feat/tester-doctor-gate`). Owner decisions, 2026-11-17:
runs are kept outside the repo and never committed; `--rerun` repeats only `FAIL`, `BLOCKED` and
`ERROR` rows with the frozen checks; retention is pooled per repository across its worktrees,
50 by default and user-configurable; the exploratory suite is on by default and can be turned off;
the eval follows the new run location. Not done: per-suite negative controls, the early halt for
undrivable surfaces.

## Decisions taken in this plan

- **Pooled store, per-worktree rerun.** Runs live in `~/.cache/tester/<repo>-<hash8>/`, where the
  hash is of the absolute `git --git-common-dir`, so every worktree of one repository shares one
  pool and one retention limit. Per-worktree pools would be orphaned when the worktree is removed
  and never pruned. `--rerun last` picks the newest run whose `run.json` names the current
  worktree, so worktrees never rerun each other's scenarios.
- **Secrets in `secrets/`.** Cookie headers, generated passwords and agent-browser state go to
  `$WORK/secrets/`. Step 7 removes it; the mod also removes `secrets/` from every older run at
  start, which covers a run that crashed before step 7.
- **A mod, not prompt arithmetic.** Pruning, repo keying and rerun lookup are deterministic, and a
  mod gets `userConfig` defaults filled in (a command body does not: an unset option reaches it
  literally). Without the mod (not loaded, refused) the run falls back to today's ephemeral
  `mktemp` dir and says `--rerun` is unavailable.
- **Frozen scenarios.** `SUITES.md` holds each check as derived (ref, steps, expected); each
  executor also writes `evidence/<suite>.md` with the exact command and output per row. A rerun
  feeds both back and the executor runs the recorded command again, changing only session paths.
  The return table stays as it is, so the eval's table parser is untouched.
- **Explore lane, reproduce-or-observe.** A new `tester:explore` agent (session model: open-ended
  judgment, unlike the brief-bound api/ui executors) runs 1–2 charters per area, with a step cap.
  Its findings are leads. The main thread turns each into a check for an api or ui executor; a
  reproduced lead becomes a `FAIL` row (triage default `spec-defect` when the spec is silent,
  `impl-defect` when it contradicts the spec), an unreproduced one an `observation` marked "not
  reproduced". Mutation consent applies to it like any suite.

## Steps

### 0. Probe
- [x] Confirm a plugin mod loads and its tool is callable under promptfoo's Agent SDK provider
      (`mcp__tester__runs` called in a throwaway run). If not, the eval sets `TESTER_RUNS_DIR`
      and asserts the fallback path instead, and the README says so.
      — Mod loads and is callable via the SDK; the probe caught tool args arriving on `e`, not
      `e.input`, fixed in `register.ts`.

### 1. Mod and options
- [x] `plugin.json` `userConfig`: `run_retention` (number, default 50, min 1) and `explore`
      (boolean, default true). Description unchanged.
- [x] `hooks/hooks.json` + `hooks/register.ts`: tool `runs`, action `start` with `scope`
      (slug source), optional `repo` (absolute worktree path) and `rerun` (`last` or a run id).
      Resolves the toplevel (cwd, then `$.session.root()`, explicit `cwd` on every git call),
      creates `<store>/<UTC timestamp>-<slug>/` mode 700 with `run.json` (worktree, branch, head,
      scope, startedAt), prunes the oldest runs beyond `run_retention` by exact path (never the
      new run or the rerun source), strips `secrets/` from older runs, and returns JSON:
      `work`, `previous` (path, scope, startedAt, counts) when rerunning, `explore`,
      `retention`, `pruned`. `TESTER_RUNS_DIR` overrides the store root (eval and tests).
      Every `tool.call` hook ends with `.catch`.
- [x] `tests/runs.test.ts` (`claude plugin test plugins/tester`): pooled key across two
      worktrees of one repo, prune order and count, rerun picks the current worktree's newest
      finished run, a missing previous run is an explicit error, secrets stripped.

### 2. Command and brief
- [x] `commands/run.md`: argument hint and scope section gain `--rerun [last|<id>]`; the
      "Ephemeral work dir" section becomes "Run directory" (mod call, fallback); step 3 writes
      `SUITES.md`; step 7 writes `RESULTS.md`, removes `secrets/` and gives the run id.
- [x] Rerun flow in `run.md`: skip derivation; refresh sessions, pre-state snapshot and Doctor;
      step 4 asks again (consent never carries over); dispatch only `FAIL`/`BLOCKED`/`ERROR`
      rows with their recorded commands; a check whose route or element no longer exists is
      `ERROR "check stale — run fresh"`; the report shows the delta (fixed, still failing,
      changed verdict).
- [x] `BRIEF_TEMPLATE.md`: cookie and password paths under `secrets/`; a line pointing
      executors at `evidence/<suite>.md`.
- [x] Gate table rows: mod unavailable → ephemeral fallback; rerun with no previous run → block;
      stale check → `ERROR`.

### 3. Exploratory suite
- [x] `agents/explore.md`: charters `slug|surface|posture|charter` (postures: skeptic, fuzzer,
      newcomer), step cap per charter, agent-browser and curl only, session isolation, no
      verdicts; returns a leads table (charter, what happened, steps, why it looks wrong) plus
      up to 5 notes.
- [x] `run.md` step 3 derives charters when `explore` is on (areas from the scope, not a generic
      survey); step 4 lists the explore suite; step 5 runs it after the api/ui suites and before
      fault, then dispatches one reproduction batch; step 7 triages reproduced leads as above.
- [x] `api.md`, `ui.md`, `fault.md`: write `evidence/<suite>.md`; rerun mode runs the recorded
      command; cookie paths under `secrets/`.

### 4. Eval
- [x] `asserts/run.js` `findWorkDir`: look in `TESTER_RUNS_DIR` (set in `promptfooconfig.yaml`
      to `.sandbox/runs`), then the old `tester.*` temp dirs; check `secrets/` is gone after the
      run. — `TESTER_RUNS_DIR` is set by the `eval:tester` script and `run-evals.sh`, since the
      SDK session inherits the process env.
- [x] Fixture: one undocumented input defect the spec does not mention (e.g. a 300-character
      project name accepted and breaking the list), keyed as an explore-only item: reported via a
      reproduced lead counts as found, and it is not scored as a false positive.
- [x] `pnpm eval:tester:fixture` passes; `pnpm eval:tester:replay` passes (table contract
      unchanged). The paid full run is the owner's call. — Fixture passes; replay found no
      recorded transcripts to replay, so it verified nothing.

### 5. Docs
- [x] `README.md`: kept runs and where they live, `--rerun`, the two options, the explore suite;
      the `mt` boundary restated (kept runs are not a maintained corpus).
- [x] `CHANGELOG.md` `[Unreleased]`.
- [x] `.claude/rules/tester.md`: the prompt surface now includes `hooks/` and `agents/explore.md`;
      model routing for explore; the eval's run-dir lookup.
- [x] Docs site page for tester, if one exists.
