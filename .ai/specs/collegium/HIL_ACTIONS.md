# Collegium — human steps (parked 2026-11-18)

The implement run is parked on human work. Resume with
`/fd3:implement-tasks .ai/specs/collegium/tasks` once step 1 is done; `implement-answers.md`
holds every answer so far.

## Steps, in order

1. **Mod-host probes G1, G2, G4** — [0001-probe-mod-host.md](tasks/0001-probe-mod-host.md), spec
   §4 TEST-5 and §12 gap rows. Run them in a live interactive session (one needs Stop pressed) and
   record yes/no for each in `evidence/spikes.md`. Unblocks *Read and merge the JSON configuration*
   (G4) and *Run lifecycle, completion notice and sweep* (G1, G2). After that, all of
   `feat/collegium` up to the UI and README can be built.
2. **Amend the spec** — `/fd3:build-spec .ai/specs/collegium/SPEC.md` (decision Q7): finalMessage
   becomes `finalMessage($, runDir): Promise<string | null>` (INTEGRATION-1); the Tally clause reads
   `External review: skipped: codex — <reason>` (D55); no codex entry is written under
   `collegium_run` never or ask-No; settle how a headless scanner or fd3 workflow answers
   INTEGRATION-3's model `choice` question; RunSpec's shape; and how the run tool gets
   `${CLAUDE_PLUGIN_ROOT}`. Best done together with the G1/G2/G4 answers.
3. **CI eval spike G3** — [0014-ci-eval-spike.md](tasks/0014-ci-eval-spike.md), once the
   `/collegium:run` skill exists on `feat/collegium`. Unblocks *Eval suite and the CI job the spike
   chose*.
4. **Gate 3** — [0016-release-collegium.md](tasks/0016-release-collegium.md): merge PR 1, release
   collegium v0.1.0, live checks.
5. **Gate 4** — [0024-release-code-review.md](tasks/0024-release-code-review.md): merge PR 2,
   release code-review, live checks.
6. **Probe G6** — [0026-probe-configure-json.md](tasks/0026-probe-configure-json.md), after
   Gate 4. Unblocks *fd3 implement-tasks step-2 Codex question* and *fd3 README line and CHANGELOG*.
7. **Gate 5** — [0029-release-fd3.md](tasks/0029-release-fd3.md): merge PR 3, release fd3,
   triggered run (G5).

## Where things live

| Branch | Worktree | State |
|---|---|---|
| Collegium plugin `feat/collegium` | `/Users/mateusz/grixu/cc-toolkit-collegium` (the parked checkout) | 5 tasks merged; CI red on ShellCheck only (accepted, Q5); 10 tasks waiting on step 1 |
| code-review Codex review `feat/code-review-codex-review` | `/Users/mateusz/grixu/cc-toolkit-collegium.worktrees/feat-code-review-codex-review` | 7 tasks merged; CI passed; review gave no verdict (no file a lens judges); the next relaunch reviews it again |
| fd3 Codex review `feat/fd3-codex-review` | `/Users/mateusz/grixu/cc-toolkit-collegium.worktrees/feat-fd3-codex-review` | 1 task merged; CI red on ShellCheck only (accepted, Q5); 2 tasks waiting on step 6 |

Task worktrees: `/Users/mateusz/grixu/cc-toolkit-collegium.worktrees/task-<slug>`; review contexts
under `/Users/mateusz/grixu/cc-toolkit-collegium.worktrees/.review/`.

## Decisions taken for you

Each one is kept as built. To revert one, name it for a repair run.

- **Codex review off means no trace.** Under `collegium_run` never or ask-No, the review writes no
  codex entry, no `codex.md` and nothing in the Tally (cr-codex-reference). This goes to step 2 to
  amend.
- **Codex review limits.** Severity comes from `severity.md`, not from Codex. Polling stops after
  7 × 600 s with `no result after 70 minutes`. Skip reasons are capped at 200 characters
  (cr-codex-reference).
- **fd3 runs Codex once.** The codex scanner gets one attempt with no retry, and `--codex` goes
  only to the first review, never to delta or repair reviews (fd3-workflow-codex).
- **Codex adapter choices.** The adapter runs `mkdir -p` on CODEX_HOME before
  `codex login --with-api-key`; this is unconfirmed against live Codex. A top-level `error` event
  maps to `warning`. `-m` takes the bare slug. Model and effort flags are skipped when absent
  (codex-adapter).
- **Prompt wrapper choices.** The plugin root is derived from the SKILL.md path. The strict check
  also rejects `then`/`else`. The task-text wording is the agent's own (prompt-wrapper).
- **Write-mode outcomes.** A merge already open in the caller's checkout returns `conflict`. A merge
  refused over local changes is detected from the text "would be overwritten by merge". A run that
  changed nothing removes its worktree but keeps the `collegium/<id>` branch. A failed
  `worktree remove` after a commit returns `failed` (write-modes, review fixes).
- **cr-scan's Codex outcomes.** A skipped Codex run ends `status: inactive`, and `handoffs` is
  always 0. cr-prepare leaves out the codex entry when no file is judged (cr-scan-prepare-codex).
- **hooks.json shape.** It follows the repo's mods (`{description, modules}`), not the current docs'
  top-level `hooks` key (collegium-scaffold).
- **Hook tests use a small fake `$`.** `tests/host.ts` builds it because the test kit cannot hand a
  hooks function a real mods `$`. Errors cross as their message only (repair). This is checked only
  on a scratch copy with a stub register.ts (46 pass); the real verdict waits for register.ts.
- **Plugin description is still a draft.** It hasn't been through cw-scribe, cw-reader or
  cw-ai-check; *Collegium README, root README rows and description* runs them.

Known risks:
- code-review's README links `../collegium/README.md`, which breaks until PR 1 merges.
- `collegium_run` exists only in the Claude Code manifest, because `.codex-plugin` has no
  userConfig.

## Open review items

1. `feat/collegium` — `hooks/write.ts:L118`: merge-refusal detection parses git's English message.
   Run git with `LC_ALL=C` (high). Report: `/Users/mateusz/grixu/cc-toolkit-collegium.worktrees/.review/feat-collegium-delta/cr-report.md`
2. `feat/collegium` — `hooks/write.ts:L113-115`: the exit code of `git merge --abort` is never
   checked (medium). Same report as 1.
3. `feat/collegium` — `hooks/codex.ts:L78, L107, L109`: CODEX_HOME sits at a predictable `/tmp`
   path with no mode set, and the OpenAI token is stored in it. Use `mktemp -d` or `mkdir -m 700`
   (security, no rule covers it). Report: `/Users/mateusz/grixu/cc-toolkit-collegium.worktrees/.review/feat-collegium-review/cr-report.md`
4. `feat/collegium` — run `/security-review` on `hooks/hooks.json` and `.claude-plugin/plugin.json`.
   Same report as 3.
5. `feat/collegium` — the coherence lens judged 23 of 48 files and the spec lens 20 of 48. Same
   report as 3.
6. `feat/collegium` — `hooks/decision.ts` and its providers: rename `wire`, add
   `RETRYABLE_STATUSES`, rewrite the header, two nits. These are report-only: D6 makes them edits to
   all four byte-identical copies. Same report as 3.
7. `feat/collegium` — `tests/host.ts`: the hand-built `$` versus test-kit stubbing (medium). The
   kit can't do this before register.ts exists. Report: `/Users/mateusz/grixu/cc-toolkit-collegium.worktrees/.review/feat-collegium-repair/cr-report.md`
8. `feat/fd3-codex-review` — `workflows/implement-run.js:L1245`: R12 MOVE, putting the Codex
   comment into `scanLenses`. Report: `/Users/mateusz/grixu/cc-toolkit-collegium.worktrees/.review/feat-fd3-codex-review-review/cr-report.md`

Routed to step 2, not a repair: the `spec` finding on `hooks/harness.ts:L36-37` (finalMessage).
