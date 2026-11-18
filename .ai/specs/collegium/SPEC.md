# collegium: run a piece of work on another harness and model

Adds a `collegium` plugin that runs one task or skill on OpenAI Codex with a chosen model and effort, asynchronously, and wires it into code-review and fd3 as an optional external Codex review.

| | |
|---|---|
| Epic / ticket | None; see section 11 |
| Status | Draft, written 2026-11-17; D52–D62 ratified 2026-11-17; validate-spec pass 4 (post-verdict), 2026-11-17: ready; post-verdict decision P1 (D63–D65, OpenAI workload identity federation) applied 2026-11-17; validate-spec pass 5, 2026-11-17: ready; post-verdict decisions P2 (D66–D68, phase-1 probes G1, G2, G4) and P3 (D69–D71, as-built deviations) applied 2026-11-18; D72–D74 and the D67/D69 details ratified 2026-11-18; validate-spec pass 6, 2026-11-18: ready (D75–D76 applied); validate-spec pass 7, 2026-11-18: ready; validate-spec pass 8, 2026-11-18: ready; post-verdict decision P4 (D77–D78, G3 negative, no eval suite) applied 2026-11-18, D78 and the C16 drop ratified the same day; validate-spec pass 9, 2026-11-18: ready; validate-spec pass 10, 2026-11-18: ready |
| Date | 2026-11-17 |
| Repository | `grixu/cc-toolkit` at `d7f6da87`, branch `feat/collegium` |

Companion documents: [evidence/12-appendix.md](evidence/12-appendix.md) (quotes the evidence rows rest on). The deciding session's notes and research sit in the uncommitted session folder beside this file; evidence rows name their report there as `SPEC.session/research/<file>` beside the source a reader on another machine can open.

## 1. Header and precedence

No earlier spec, plan or ADR exists for collegium: `.ai/specs/` held only `prepare-proof/` and `.ai/plans/` no collegium plan at `d7f6da87`. Two written rules in code-review are amended, and this spec wins where they disagree:

1. `plugins/code-review/docs/adr/0002-active-lens-set-and-standards.md` and `plugins/code-review/commands/start-cr.md:6` ("Lenses are gated by the input, never by the user"): the Codex review is gated by a user setting (D38) and by tool presence (D35). It is not a lens of the lens set: it is an external review that rides the lens-file channel (D41, D55), so the input-gated rule keeps holding for every lens.
2. `plugins/code-review/commands/start-cr.md:274-286` (fail closed on any active lens that did not deliver, with a proceed-or-abort menu): the Codex review never enters that menu; a failed or timed-out run degrades to `skipped: codex` (D37, D55).

Nothing else in code-review's or fd3's written rules is reversed. The question-ledger proposal in Q18 option a (branch-only write mode) was widened by the user's Q20 answer into three modes (D24); it is not a reversal of a written rule.

Decision numbering: `D1`–`D38` are the closing notes' ratified `R1`–`R38`; `D39`–`D51` are the notes' assistant-taken `D1`–`D13`; `D52`–`D61` were taken while writing this spec and ratified by the user on 2026-11-17; `D62` is the user's answer to the landing-unit size question the same day; `D63` is the closing notes' post-verdict decision `P1`, and `D64`–`D65` were taken while applying it and ratified by the user the same day; `D66`–`D68` are the post-verdict decision `P2`, ratified by the user on 2026-11-18 (D68 is also the implement run's decision Q8 in `implement-answers.md`), and `D69`–`D71` are `P3`, the implement run's decision Q7, ratified on 2026-11-17; `D72`–`D74` settle P3's open questions and were ratified by the user on 2026-11-18 (P2/P3 writing report, questions 1–3), which also ratified D67's drop and once-per-run details and D69's `null` rule (questions 4–5); `D75`–`D76` are the user's repair choices on validate-spec pass 6, 2026-11-18; `D77` is the post-verdict decision `P4`, the implement run's decision Q9, ratified on 2026-11-18, and `D78` was taken while applying it and ratified by the user the same day (P4 writing report, question 1), which also kept C16 dropped with no README note (question 2).

## 2. Problem and goal

Today the toolkit can reach another harness in one place only, and only by hand:

- `codex-plan-improver` is the one plugin that drives Codex, with a fixed model, no effort flag, no timeout and no structured result (`plugins/codex-plan-improver/commands/codex-review.md:43-46`; `SPEC.session/research/repo-prior-art.md`, section 1).
- No code detects whether a harness is installed, logged in or which models it offers (`SPEC.session/research/repo-prior-art.md`, section 5).
- code-review's lenses all run on Claude, so a review has no reader from another model family (`plugins/code-review/commands/start-cr.md:217-235`).
- A long Codex job cannot be awaited from a mod tool call by plain waiting: `$.clock.sleep` counts toward the 10 s hook budget, and `$.process.run` stops at 10 minutes per call (`SPEC.session/research/mod-api.md`, sections 1 and 4).

**Goal:** a user or another plugin hands Collegium one task, Collegium picks the Codex model and effort, runs it unattended for up to an hour without blocking the caller, and returns a fixed-shape result — and code-review uses it to add an optional Codex review to its report.

Secondary goal that shapes the structure: further harnesses (oh-my-pi, Cursor, Gemini, droid) must fit later without changing the tool contract, so every harness-specific fact lives behind one adapter contract (D8, INTEGRATION-1), and a model is always named `provider/model` inside a palette (D5).

## 3. Design decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **One run is one task on one harness, one model, one effort; no fan-out in v1.** | Q1 a. A council of models would multiply cost and needs a merge step nobody designed. |
| D2 | **Callers are the user (`/collegium:run`) and other plugins (mod tools with a stable contract).** | Q2 a. Mod tools are callable from subagents and workflow agents (`SPEC.session/research/mod-tools-subagents.md`, Verdict). |
| D3 | **Write access is a per-request parameter, read-only by default, and writing happens only in a separate git worktree.** | Q3 a. The caller's checkout is never written by Codex; cost accepted: a worktree per write run. |
| D4 | **v1 covers harness detection and enabling, model catalogue, tiers, the decision-model choice, prompt wrapping with a result contract, and auth checks; Claude as an external harness, cost and limit accounting, session resume and the reverse direction are out.** | Q4 a. The out items are in section 10. |
| D5 | **The decision model picks model and effort; the caller may give either or both and the decision fills only what is missing. Tier mapping (high/medium/low) is optional and empty by default, and then the choice is from the harness's whole palette. A palette is the models of one provider inside one harness, and a model is named `provider/model`.** | Q5 a plus the user's extension. oh-my-pi lists models as `provider/id` across several providers (`SPEC.session/research/oh-my-pi.md`, section 3), so the name survives a second harness. |
| D6 | **The decision backend is a fourth copy of the TypeSafe Jev (`jev-1.14.0`) / Gemini `gemini-decision-1` client with the same auto/typesafe/gemini choice; without a key it falls back to Haiku through `$.model.complete`.** | Q6 b. Plugins cannot import each other, so the client is copied (`plugins/dev-kit/hooks/decision.ts:1-3`); the Haiku precedent is `plugins/dev-kit/hooks/register.ts:454`. |
| D7 | **Effort is chosen from the efforts the chosen model supports, read from the Codex catalogue.** | Q7 a. Efforts differ per model: `ultra` is missing on luna and hidden models (`SPEC.session/research/live-harnesses.md`, Models and effort). |
| D8 | **v1 supports Codex only, behind a written harness-adapter contract.** | Q8 a. Codex is the only harness installed and logged in with models (`SPEC.session/research/live-harnesses.md`, Summary). |
| D9 | **Harness update handling is dropped from v1.** | Q9, user: "Odpuszczamy aktualizacje". `codex exec` never runs an update check (`SPEC.session/research/harness-docs.md`, auth/update answer). |
| D10 | **Login is checked before each run with `codex login status` (exit 0/1); logged out fails fast with the instruction `! codex login`; Collegium never logs in for the user.** | Q10 a. A logged-out `codex exec` retries 401s for about 15 s before failing (`SPEC.session/research/harness-docs.md`, auth answer). |
| D11 | **The caller names the harness, otherwise the first enabled harness in the user's order runs.** | Q11 a. |
| D12 | **Each palette has an exclude list; an explicit tier mapping wins over an exclusion.** | Q12 a. |
| D13 | **Detection runs lazily on the first Collegium call in a session; the catalogue is cached in `$.store`; login is checked per run.** | Q13 a. `$.store` is a per-plugin JSON store kept across sessions, 4 MiB total (`SPEC.session/research/mod-api.md`, section 2). |
| D14 | **A mod registers the tools (`collegium_run`, `collegium_status`, `collegium_result`) and the plugin ships a `/collegium:run` skill for humans; other plugins call the tools directly.** | Q14.1 a. |
| D15 | **Runs are asynchronous: `collegium_run` returns a run id at once, `collegium_status(id)` returns state and progress, `collegium_result(id, wait)` returns or waits for the result.** | Q14.2 b; user's reason: 30-minute Codex reviews and progress visibility for the calling harness. |
| D16 | **The Codex process lives as long as the Claude Code session that started it (`$.process.spawn`); closing Claude Code kills it.** | Q15.1 b. Cost accepted: a closed session loses its runs; the spawn lifetime was the open fact behind K3 and D29, settled by I25 and D66. |
| D17 | **Completion: the caller may wait or poll, and the mod also injects "run X finished" into the idle session.** | Q15.2 a. Delivery mechanics are D67, with D43 for a dropped submit; narrowed by D76 to runs started from the main loop. |
| D18 | **Run directories live beside the repository: `<parent>/<repo-dir-name>.collegium/<run-id>/`.** | Q15.3, the user's own answer. Matches fd3's `<repo>.worktrees/` convention (`plugins/fd3/workflows/implement-run.js:77`). |
| D19 | **Default maximum run time is 60 minutes, caller may override; on expiry the process is killed and the status is `timeout`.** | Q15.4 a. Codex exec has no timeout flag (`SPEC.session/research/live-harnesses.md`, Headless). |
| D20 | **A run directory is deleted once the caller has received the result; at the first call of a new session, directories of runs whose process is dead are swept. Write-mode branches stay.** | Q15.5 a; user: no traces expected beyond what the harness keeps. |
| D21 | **A fixed preamble ("unattended; never ask questions; record assumptions; if you truly cannot continue, finish with status blocked") and a fixed envelope `{status: done\|blocked\|failed, summary, result, assumptions[], open_questions[]}` via `--output-schema`; the caller may supply its own strict JSON schema for `result`.** | Q16 b. Any question ends a `codex exec` run (`SPEC.session/research/repo-prior-art.md`, section 4). |
| D22 | **A skill is passed by pointing the prompt at its `SKILL.md` path ("read and follow"); nothing is copied into the repository.** | Q17.1 a. Codex has no per-run skill flag (`SPEC.session/research/codex-skills.md`, question 1). |
| D23 | **Collegium substitutes `$ARGUMENTS`, `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_SKILL_DIR}` in a copy of `SKILL.md` in the run directory, and the preamble says user questions and Claude Code subagents are unavailable.** | Q17.2 a. Codex substitutes nothing in skill text (`SPEC.session/research/codex-skills.md`, question 2). |
| D24 | **Write mode is the caller's choice among `branch` (worktree and branch `collegium/<id>` from HEAD, Codex in `workspace-write`, Collegium commits after exit with the summary as message, returns branch and diffstat, removes the worktree, keeps the branch), `worktree` (changes left uncommitted in the worktree) and `merge` (commit, then merge into the caller's current branch; on conflict abort, keep the branch, status `conflict`).** | Q18 and Q20 a; the user frames it as auto-merging the completed work. Collegium commits because Codex cannot commit inside `workspace-write` (`SPEC.session/research/codex-skills.md`, question 5). |
| D25 | **Configuration lives in JSON; `userConfig` carries only harness enable/disable.** | Q19.1 b. `userConfig` has no object or nested type (`SPEC.session/research/harness-docs.md`, userConfig answer). |
| D26 | **A detected harness is disabled until the user enables it; the first call says "Codex detected, enable it in /plugin configure".** | Q19.2 a. Enabling is the consent to send code to OpenAI (K2). |
| D27 | **User file `${CLAUDE_PLUGIN_DATA}/config.json`, project file `.claude/collegium.json`; the project overrides the user field by field and may only disable a harness, never enable one.** | Q19.3 b and Q21 a. Field-by-field semantics are D60. |
| D28 | **A `/collegium:config` command detects harnesses, shows the catalogue, asks (scope, tier mapping, exclusions) and writes the JSON.** | Q22 a. |
| D29 | **Spike: a mod `$.process.spawn` lasting 65 minutes must deliver its stream and exit code; if it fails, Collegium falls back to a detached process (`nohup … &`; macOS ships no `setsid`) with the run directory as the source of truth.** | Q23 a; the spike started during the session (K3). G1 answered yes on 2026-11-18, so the fallback is not built (D66). |
| D30 | **No concurrency limit; quota errors from Codex surface as `failed` with the reason.** | Q24 a. |
| D31 | **Tests: mod unit tests with a stubbed `$` (`claude plugin test`), a manual live script against real Codex, and a `claude plugin eval` suite for `/collegium:run`.** | Q25 b. `claude plugin test` runs `*.test.ts` against `claude-code/testing` (`SPEC.session/research/ci-evals.md`, section 2). The eval suite fell to D77. |
| D32 | **One integration in v1: code-review gets an additional Codex review through Collegium, with no declared plugin dependency.** | Q26 b and Q27 a. A missing declared dependency silently unloads the dependent plugin (user memory `cc-plugin-dependencies.md`, quoted in `SPEC.session/research/code-review-integration.md`, section 4). |
| D33 | **The eval also runs in CI. The first implementation task is a CI spike; if it fails (G3), the eval stays local-only and CI runs a new `claude plugin test` job instead. CI authenticates Codex as D63 says.** | Q28 b and Q34 a. Only `EVAL_*` variables pass into an eval run, and whether a mod sees them is undocumented (`SPEC.session/research/ci-evals.md`, section 4); the original API key secret, `EVAL_OPENAI_API_KEY` and one login per session fell to D63. Superseded by D77: the spike came back negative (G3), so neither the eval nor a new job lands. |
| D34 | **The Codex review runs in interactive `/start-cr` and in the headless skills fd3 uses; it is configurable, and when not configured fd3 `implement-tasks` asks in step 2 whether to review and whether with Codex.** | Q29 b. Scope spans three plugins: collegium, code-review, fd3. |
| D35 | **The Codex review is on whenever the Collegium tool is available and Codex is enabled in Collegium, governed by D38's setting.** | Q30 b. |
| D36 | **Codex gets code-review's family and rule table and the schema `{family, rule, severity, path, lines, loss, fix}`; the result is rendered into `<ctx>/codex.md` in scanner-contract format and added to `lenses.active`; items fitting no rule go to `CANDIDATES`.** | Q31 a. The merge reads whatever `lenses.active` lists, with no lens-name whitelist (`plugins/code-review/skills/cr-merge/SKILL.md:28-34`). |
| D37 | **The Codex run starts together with the Claude scanners; the merge waits for it (60-minute limit); failure or timeout is `skipped: codex` in the Tally, never the fail-closed menu.** | Q32 a. |
| D38 | **code-review gets a `userConfig` option `collegium_run` with values `always`, `never`, `ask`.** | Q33 a. |
| D39 | **The write-mode worktree lives inside the run directory: `<parent>/<repo>.collegium/<run-id>/worktree`.** | assistant-taken (notes D1), following D18; covered by the user's closing confirmation. |
| D40 | **A caller-supplied `result` schema is checked locally against strict-mode rules (object root, `additionalProperties: false`, every property required, no `allOf`/`not`/`if`) before launch.** | assistant-taken (notes D2), following D21. Codex validates the schema only as JSON, so a bad one fails at the API (`SPEC.session/research/codex-skills.md`, question 3). |
| D41 | **A Codex finding agreeing with a Claude lens counts as independent convergence; Codex is not counted among code-review's lenses, hard-coded lens counts stay, and the docs call it an "external review".** | assistant-taken (notes D3), following D36. Convergence of independent readers is the strongest signal the merge has (`plugins/code-review/references/merge-contract.md:55-62`). |
| D42 | **With `--pr`, Codex runs with that pull request's worktree as its working directory.** | assistant-taken (notes D4), following D36; `scope.json` `checkout` is the PR worktree under `--pr` (`plugins/code-review/commands/start-cr.md:208-209`). |
| D43 | **The completion notice is sent from the main-thread `turn.complete` event (`!e.agentId`), because `$.prompt.submit` is refused inside a `tool.call` hook.** | assistant-taken (notes D5), following D17; the refusal is a host check seen live (`SPEC.session/research/mod-tools-subagents.md`, Verdict). Narrowed by D67 to a run whose submit at completion the host dropped. |
| D44 | **fd3 workflow agents that call Collegium carry its tools on their allow list, since nobody answers a permission prompt inside a workflow.** | assistant-taken (notes D6), following D34. Probes pre-allowed the tool; an unallowed call in a workflow would likely be denied (`SPEC.session/research/mod-tools-subagents.md`, Caveats). |
| D45 | **`collegium_run` defaults to `ask`; an unset option (literal `${user_config.collegium_run}` in skill text) is treated as `ask`; `/start-cr` asks per review when it is `ask`.** | assistant-taken (notes D7), following D38. Unsaved options stay literal in skill bodies and `default` is ignored there (`SPEC.session/research/repo-prior-art.md`, section 3). |
| D46 | **Codex invocation: empty stdin, `--skip-git-repo-check`, `-C <dir>`, `-s read-only\|workspace-write`, `-m`, `-c model_reasoning_effort=<level>`, `--json`, `-o <file>`, `--output-schema <file>`; `error` events that are only config warnings are not failures; no `--ephemeral`.** | assistant-taken (notes D8), following D21. Each flag and the warning events were seen in the live trial (`SPEC.session/research/live-harnesses.md`, Trial run). |
| D47 | **Hidden catalogue models (`gpt-reserve`, `codex-auto-review`) are excluded from the palette unless explicitly mapped to a tier.** | assistant-taken (notes D9), following D12. They carry `visibility: hide` (`SPEC.session/research/live-harnesses.md`, Models and effort). |
| D48 | **When the caller gives a model but no effort, the decision model chooses only the effort.** | assistant-taken (notes D10), following D5. |
| D49 | **`collegium_run=always` with the Collegium tool absent yields `skipped: codex` with a reason, not an error.** | assistant-taken (notes D11), following D35 and D37. |
| D50 | **`merge` mode fast-forwards when possible, otherwise creates a merge commit.** | assistant-taken (notes D12), following D24. |
| D51 | **The plugin description goes through `/compound-writing:cw-scribe`, `/compound-writing:cw-reader` and `/compound-writing:cw-ai-check`.** | assistant-taken (notes D13); the repository's `CLAUDE.md` ("Plugin descriptions") requires it. |
| D52 | **One Codex-review path for both routes: `/start-cr` and `cr-prepare --codex` put a `codex` entry in `lenses.active`, and a `code-review:scanner` agent running `cr-scan --lens codex` calls Collegium, waits, and writes `codex.md`. fd3 dispatches the `codex` lens as its own agent even when one agent runs every other lens.** | assistant-taken while writing, ratified by the user 2026-11-17 (writing report question batch); following D34, D36 and D37. `cr-prepare` can wait for nothing (`SPEC.session/research/code-review-integration.md`, section 3), and one renderer keeps the two routes' `codex.md` identical; would flip if the user wants the `/start-cr` orchestrator to call Collegium itself. |
| D53 | **`collegium_result` waits at most 600 seconds per call, inside a `$.process.run` that watches the run's exit file; a caller that wants longer calls again until the state is terminal.** | assistant-taken while writing, ratified by the user 2026-11-17 (writing report question batch); following D15 and D37. Time inside `$.process.run` does not count toward the 10 s budget but one call caps at 10 minutes, and chained calls are proven only to 1200 s (`SPEC.session/research/mod-api.md`, sections 1 and 4). |
| D54 | **fd3 `implement-tasks` reads code-review's saved `collegium_run` with `claude plugin configure code-review --json`: `always` turns the Codex review on without asking, `never` turns it off, unset or `ask` adds the question to step 2; the answer reaches the workflow as `codexReview: true\|false`.** | assistant-taken while writing, ratified by the user 2026-11-17 (writing report question batch); following D34 and D38. A plugin cannot read another plugin's `${user_config.*}`; the CLI shows non-sensitive saved values (`SPEC.session/research/harness-docs.md`, userConfig answer), unprobed (gap G6). |
| D55 | **A Codex run that fails, times out, is skipped or finds the tool absent still writes `codex.md`, with the header `Lens: codex · skipped: <reason>`; `cr-merge` and the `/start-cr` merge read that as `External review: skipped: codex — <reason>` in the Tally (D70) and never as an undelivered lens; a review the user switched off writes nothing (D71). Codex stays outside `Lenses: L of A`; a delivered run adds `External review: codex` to the Tally.** | assistant-taken while writing, ratified by the user 2026-11-17 (writing report question batch); following D37 and D41. `cr-merge` otherwise returns `incomplete` for a missing or headerless lens file (`plugins/code-review/skills/cr-merge/SKILL.md:28-34`), which would hold an fd3 branch on an optional reader. The Tally wording is D70's. |
| D56 | **The decision backend choice (`auto`, `typesafe`, `gemini`) lives in the JSON config as `decision.backend`; API keys come from the environment only (`TYPESAFE_API_KEY`, `GEMINI_DECISIONS_API_KEY`, then `GEMINI_API_KEY`); `auto` with both keys uses `typesafe` instead of asking.** | assistant-taken while writing, ratified by the user 2026-11-17 (writing report question batch); following D6 and D25. D25 keeps key options out of `userConfig`, the copied `providerKeys` already falls back to these variables (`plugins/dev-kit/hooks/providers/index.ts:33-39`), and an unattended caller cannot answer "Backend choice needed" (`index.ts:60-67`). |
| D57 | **A run id is `<UTC yyyymmddThhmmss>-<6 hex>`, and the run directory's `state.json` is the source of truth for state; the mod's in-memory map only caches it.** | assistant-taken while writing, ratified by the user 2026-11-17 (writing report question batch); following D18 and D29. The detached fallback of D29 had no mod memory, so the file had to carry the state; with spawn as the only path (D66) the file still carries it for the next session's sweep (D20). |
| D58 | **`/collegium:run` launches the run, prints the run id and ends its turn; on the completion notice it calls `collegium_result` and shows the envelope.** | assistant-taken while writing, ratified by the user 2026-11-17 (writing report question batch); following D15 and D17. Mirrors `/start-cr`'s "waiting is ending your turn" (`plugins/code-review/commands/start-cr.md:265-273`). D75 adds a `--wait` form for headless sessions; this stays the default. |
| D59 | **A tier maps to exactly one `provider/model`; with a mapping present the decision picks a tier, otherwise a model from the palette. When the Haiku fallback answers with a model or effort outside the allowed set, Collegium passes neither `-m` nor the effort flag and Codex uses its own configured defaults.** | assistant-taken while writing, ratified by the user 2026-11-17 (writing report question batch); following D5, D6 and D7. Codex's config default is `gpt-6.1-sol` at `high` on this machine (`SPEC.session/research/live-harnesses.md`, Models and effort). |
| D60 | **"Field by field" (D27) means: tier keys merge one by one (project wins per tier), an exclude list in the project replaces the user's list for that palette, `harnesses.order` in the project replaces the user's, and `disabled` names harnesses the project switches off.** | assistant-taken while writing, ratified by the user 2026-11-17 (writing report question batch); following D27. |
| D61 | **Commits in `branch` and `merge` modes use the user's git configuration as it is, signing included, but repository hooks do not run on them: a mod's git runs with repo hooks off (host behaviour, K5). A commit that fails ends the run `failed` with git's message and keeps the worktree. `merge` runs in the caller's checkout, and a merge git refuses because of local changes is status `conflict`.** | assistant-taken while writing, ratified by the user 2026-11-17 (writing report question batch); following D24 and D50. Collegium never bypasses signing itself. Hooks-off was accepted by the user on 2026-11-17 (validate-spec pass 1, question 1, option a), because `$.process.run` git "runs with repo hooks off" (`SPEC.session/research/mod-api.md`, section 1). |
| D62 | **Landing unit 1 (phases 1–3) stays one pull request; it is not split.** | The user's answer, 2026-11-17, to the writing report's subdivision question, which proposed a read-only PR 1a and a write-modes, config, eval and CI PR 1b. Cost accepted: one review of about 35 files and 3,500–4,000 changed lines (estimate in section 7). |
| D63 | **CI uses OpenAI workload identity federation, not a stored key: no `OPENAI_API_KEY` secret; the eval job gets `id-token: write`; right before every Codex start the mod fetches a fresh GitHub OIDC JWT, exchanges it at `POST https://auth.openai.com/oauth/token`, and logs that run's temporary `CODEX_HOME` in with the `access_token` through `codex login --with-api-key`. Tokens and JWTs never reach logs, and the workflow's token guard also covers the OIDC request token.** | P1 (closing notes, post-verdict), option (a) of (a) re-exchange per Codex start, (b) keep the key, (c) exchange once and keep the eval under 5 minutes; ratified by the user 2026-11-17. It supersedes D33's key secret because the user chose WIF; per start, because an exchanged token never outlives GitHub's 300 s JWT and has no refresh (`SPEC.session/research/openai-wif.md`; `evidence/12-appendix.md`). Without a caller since D77; its code leaves scope under D78. |
| D64 | **The eval step passes `EVAL_ACTIONS_ID_TOKEN_REQUEST_URL`, `EVAL_ACTIONS_ID_TOKEN_REQUEST_TOKEN`, `EVAL_OPENAI_WIF_AUDIENCE`, `EVAL_OPENAI_IDENTITY_PROVIDER_ID` and `EVAL_OPENAI_SERVICE_ACCOUNT_ID`; the mod takes the CI path when the request token is non-empty, and each run's `CODEX_HOME` is `<os tmpdir>/collegium-codex-home/<run-id>`.** | assistant-taken while applying P1, ratified by the user 2026-11-17 (P1 writing report, question 1); P1 fixes the five values but not their names or the home's path. Names are the source names with the `EVAL_` prefix an eval run requires (`SPEC.session/research/ci-evals.md`, section 4); a home per run keeps concurrent runs (D30) from overwriting each other's login. Without a caller since D77; leaves scope under D78. |
| D65 | **Every TEST-3 case pins `openai/gpt-6-luna` at effort `low`.** | assistant-taken while applying P1, ratified by the user 2026-11-17 (P1 writing report, question 2); P1 requires a fast model at low effort so each `codex exec` ends inside the ~5-minute token and names `gpt-6-luna` or `gpt-6.1-sol` + `low` as examples. The catalogue describes `gpt-6-luna` as "Fast and affordable model for easier tasks" and `low` as "Fast responses with lighter reasoning" (`SPEC.session/research/codex-models.json`); cost accepted: the eval does not exercise the model the user runs by default. Moot since D77: TEST-3 is dropped. |
| D66 | **The run process is a `$.process.spawn` started un-awaited from the `collegium_run` handler; D29's detached `nohup … &` fallback is not built.** | P2 (closing notes, post-verdict), ratified by the user 2026-11-18; G1's rule under D29 with a yes answer. In an interactive 2.1.327 session the spawn survived its handler's return and a later user Stop, with 90 of 90 chunks and `{code:7}` (`evidence/spikes.md`, G1). |
| D67 | **The completion notice is submitted when the run reaches a terminal state, through the `$` of the `collegium_run` handler that started the run. A submit the host answers with `drop` leaves the run in the pending set, and the next main-thread `turn.complete` (D43) submits it there; each run's notice is sent once: an accepted submit takes the run out of the pending set, and any `drop` answer, not only the one after a Stop, falls back to `turn.complete`.** | P2, ratified by the user 2026-11-18; the drop and once-per-run details were assistant-taken while applying P2 and ratified the same day (P2/P3 writing report, question 4). It replaces D43's `turn.complete`-only delivery (assistant-taken, notes D5), which rested on the refusal inside `tool.call`: after the handler returned, a submit started a turn in an idle session, and after a user Stop it resolved `{"drop": …}` (`evidence/spikes.md`, G2). `$` cannot be stored, so the starting handler's `$` is the only one available at completion. |
| D68 | **Collegium requires Claude Code 2.1.327 or later, and the plugin-evals CI pin is 2.1.327. CONFIG-2 takes `CLAUDE_PLUGIN_DATA` from `$.process.hookEnv()`, never builds the path by hand, and has no `$.store` or `collegium_config` fallback.** | P2, implement-run decision Q8, ratified by the user 2026-11-18 (`implement-answers.md`). `hookEnv()` is absent on 2.1.322, 2.1.323 and 2.1.325 and present on 2.1.326 and 2.1.327 (`evidence/spikes.md`, G4); 2.1.327 rather than 2.1.326 is the user's choice. |
| D69 | **INTEGRATION-1's `finalMessage` is `finalMessage($, runDir): Promise<string \| null>`, and it returns `null` for a missing or empty `-o` file.** | P3, implement-run decision Q7, ratified by the user 2026-11-17 (`implement-answers.md`); as-built kept, and the `null` rule ratified 2026-11-18 (P2/P3 writing report, question 5; `plugins/collegium/hooks/codex.ts:163-166`). A hooks module has no Node (`SPEC.session/research/claude-code.d.ts:23-24`), so it reads the `-o` file through the asynchronous `$.fs`. |
| D70 | **The Tally clause of a Codex review that did not deliver reads `External review: skipped: codex — <reason>`.** | P3, decision Q7, ratified by the user 2026-11-17; as-built kept. It replaces the bare `skipped: codex — <reason>` of D55 (ratified in the writing report), so the clause sits under the same `External review` label as a delivered `External review: codex`. |
| D71 | **Under `collegium_run: never`, or `ask` answered No, the review writes no `codex` entry, no `codex.md` and nothing in the Tally. D55's skip header is for a Codex review that was on and did not deliver.** | P3, decision Q7, ratified by the user 2026-11-17; as-built kept. A review the user switched off is not a skip. |
| D72 | **INTEGRATION-3's `choice` is a question type of the decision client, answered by the decision backend or the Haiku fallback, never by a person; a headless scanner or the fd3 workflow needs nothing extra to get a model and effort.** | The user's answer, 2026-11-18, to P3's open question (P2/P3 writing report, question 1). The type is `{ type: 'choice'; instructions; options }` in the copied client (`plugins/collegium/hooks/decision.ts:11`). |
| D73 | **`RunSpec` is `{ runDir, dir, write: boolean, prompt, schemaPath, model?, effort?, env }`: `dir` is the harness's working directory, `prompt` the text of `<run>/prompt.md`, `schemaPath` the `<run>/schema.json` INTEGRATION-4 wrote, an absent `model` leaves the harness default, and `env` is what `prepare` returned.** | The user's answer, 2026-11-18, to P3's open question (question 2); as built at `plugins/collegium/hooks/harness.ts:27-37`, where `809aba73` added `schemaPath`. `invocation` is synchronous and has no `$`, so the caller passes the prompt text. |
| D74 | **The `${CLAUDE_PLUGIN_ROOT}` substituted in a skill copy is derived from the `SKILL.md` path: `<root>/skills/<name>/SKILL.md` gives `<root>`, any other layout gives the skill's own folder. API-1 has no `plugin_root` input.** | The user's answer, 2026-11-18, to P3's open question (question 3); as built at `plugins/collegium/hooks/prompt.ts:96-101`. |
| D75 | **`/collegium:run --wait` does not end its turn after launch: it calls `collegium_result` with `wait_seconds: 600` until the state is terminal, then shows the envelope. TEST-2 passes `--wait`.** | The user's repair choice (a), 2026-11-18, on validate-spec pass 6's finding: a `claude -p` session exits when its turn ends, which kills the spawn and refuses the notice (pass 6 probe, section 12). The eval cases it was also for are gone (D77); `--wait` stays for headless sessions, TEST-2 among them, which do not exercise the notice path TEST-1 covers. |
| D76 | **The completion notice is sent only for a run whose `collegium_run` call came from the main loop (no `e.agentId` on the `tool.call`); a subagent or workflow caller waits with `collegium_result` itself. A submit that rejects is dropped, and the run leaves the pending set.** | The user's repair choice (a), 2026-11-18, on validate-spec pass 6's finding: the main thread answering a notice would take a waiting scanner's result, which D20 then deletes. `tool.call` carries `agentId`, absent on the main loop (`SPEC.session/research/claude-code.d.ts:395-404`). Narrows D17 and D67. |
| D77 | **Collegium has no eval suite: TEST-3 and CICD-1's eval arm are dropped, CICD-1 is the spike alone with its negative outcome recorded, CICD-2 builds nothing because `lint.yml` already runs `claude plugin test` on every mod plugin, and UI-1 is checked by TEST-2's `/collegium:run --wait` runs.** | P4 (closing notes, post-verdict), implement-run decision Q9, ratified by the user 2026-11-18 (`implement-answers.md`). Inside `claude plugin eval` the mod gets only manifest-default options, so `codex` is `false` and no case can enable it, and `$.http.fetch` is refused (`evidence/spikes.md`, G3); supersedes D31's eval suite and D33, and leaves D65 moot. |
| D78 | **The WIF exchange leaves scope: Codex's `prepare` returns `{}`, and its CI path (`TOKEN_EXCHANGE_URL`, `ciFailure`, `fetchTokenField`, the `EVAL_*` reads) and the tests of it are removed. INTEGRATION-1 keeps `prepare` and `RunSpec.env` (D73) as the per-run env hook a later harness can use.** | assistant-taken while applying P4, ratified by the user 2026-11-18 (P4 writing report, question 1, option a); P4 notes that D63/D64 and their code in `hooks/codex.ts` become dead unless another CI use appears, and none is named. The CI path's only trigger is `EVAL_ACTIONS_ID_TOKEN_REQUEST_TOKEN` (`plugins/collegium/hooks/codex.ts:79-81`); cost accepted: a later CI use rebuilds it from git history and `evidence/12-appendix.md`; would flip if the user wants it kept dormant. |

### Risks accepted

| # | Risk | Cost if it lands | Mitigation |
|---|---|---|---|
| K1 | `codex debug models` is a diagnostic command; its JSON may change without notice. | Detection or effort lists break after a Codex update. | INTEGRATION-2 parses only `slug`, `visibility`, `supported_reasoning_levels[].effort`, `default_reasoning_level`; a parse failure fails the run with the Codex version named. |
| K2 | Code and task content go to OpenAI. | Data leaves the machine for every run. | D26: disabled until the user enables Codex; enabling is the consent. |
| K3 | The 65-minute spawn spike had not finished at confirmation. | A run over the spawn limit loses its stream or exit code. | Resolved after confirmation: the spike passed (I25), so D16 stands. What it left untested, an interactive session and a spawn outliving its handler, was probed on 2026-11-18 and holds (D66). |
| K4 | Whether a mod inside `claude plugin eval` sees `EVAL_*` variables is undocumented. | The CI eval cannot log Codex in. | Settled 2026-11-18: the mod does see `EVAL_*`, but the eval stops earlier on options and `$.http.fetch` (G3 closed negative), so no eval lands (D77). |
| K5 | Collegium's commits and merges run with repo hooks off (D61). | Pre-commit and commit-msg checks are skipped on `collegium/*` commits, and post-merge hooks are skipped on the caller's merge. | The hooks still run on the caller's next own commit or push, and CI runs the same checks. |
| K6 | The GitHub OIDC request token is visible to the eval run's environment for the job's duration (D63, accepted with P1). | Anything in the run can mint OIDC JWTs for this job and exchange them for OpenAI tokens. | Void under D77 and D78: no eval job gets `id-token: write` and no code reads the request token. |
| K7 | An exchanged OpenAI token lives about 5 minutes (D63). | A `codex exec` running longer loses API access mid-run and the case fails. | Void under D77 and D78: no token is exchanged. |
| K8 | `codex login --with-api-key` writes the exchanged token into the run's `CODEX_HOME`, which the eval step may keep with the run's home and tmp (`--keep-temp`) and upload to the private R2 bucket; the workflow's guard looks only for the Claude Code OAuth token (accepted by the user, validate-spec pass 5). | Anyone who reads the bucket before the token expires can make OpenAI API calls as the service account. | Void under D77 and D78: no eval runs collegium and no token is exchanged. |

## 4. Target architecture

```
plugins/collegium/
  .claude-plugin/plugin.json      CONFIG-1
  hooks/hooks.json                { "modules": ["./register.ts"] }
  hooks/register.ts               API-1..3, INTEGRATION-5 (events)
  hooks/harness.ts                INTEGRATION-1
  hooks/codex.ts                  INTEGRATION-2
  hooks/config.ts                 CONFIG-2
  hooks/choose.ts                 INTEGRATION-3
  hooks/decision.ts, hooks/providers/{index,gemini,typesafe}.ts   byte-identical copy (D6)
  hooks/prompt.ts                 INTEGRATION-4
  hooks/runs.ts                   INTEGRATION-5
  hooks/write.ts                  INTEGRATION-6
  skills/run/SKILL.md             UI-1
  commands/config.md              UI-2
  tests/*.test.ts                 TEST-1
  scripts/live-check.sh           TEST-2
```

### CONFIG-1: collegium `userConfig`

```json
"userConfig": {
  "codex": {
    "type": "boolean",
    "title": "Codex",
    "description": "Let Collegium run tasks on OpenAI Codex. Turning it on sends the task and the code Codex reads to OpenAI.",
    "default": false
  }
}
```

The only option (D25). Read in the mod from `register(on, options)`. A later harness adds one boolean.

### CONFIG-2: the JSON configuration

User file at `${CLAUDE_PLUGIN_DATA}/config.json`, project file at `<project root>/.claude/collegium.json` (D27). Both optional; both have this shape:

```json
{
  "harnesses": {
    "order": ["codex"],
    "disabled": [],
    "codex": {
      "palettes": {
        "openai": {
          "tiers": { "high": "openai/gpt-6.1-sol", "medium": "openai/gpt-6-astra", "low": "openai/gpt-6-luna" },
          "exclude": ["openai/gpt-5.6-luna"]
        }
      }
    }
  },
  "decision": { "backend": "auto" }
}
```

- `tiers` keys are `high`, `medium`, `low`, each optional, each one `provider/model` (D59). A mapped model wins over `exclude` and over hidden visibility (D12, D47).
- `decision.backend` is `auto`, `typesafe` or `gemini` (D56); absent means `auto`.
- Merge: project over user by D60; a project `disabled` entry turns a harness off, and nothing in the project file turns one on (D27).
- Effective enablement of a harness = `userConfig` flag on AND not in the merged `disabled` (D26, D27).
- The mod reads the user file's directory from `await $.process.hookEnv()` (`CLAUDE_PLUGIN_DATA`) and never builds it by hand: under `--plugin-dir` it is `<config dir>/plugins/data/<name>-inline` (D68).
- An unreadable or invalid file is an error naming the file and the field; Collegium never runs on a half-read config.

### INTEGRATION-1: harness adapter contract

```ts
interface HarnessAdapter {
  id: string                                   // 'codex'
  detect($): Promise<{ installed: boolean; version?: string; path?: string }>
  catalogue($): Promise<Palette[]>             // cached in $.store by the caller (D13)
  prepare($, runId: string): Promise<Record<string, string>>  // env merged into every harness call of the run; Codex: {} (D78)
  loginStatus($, env): Promise<{ loggedIn: boolean; fix: string }>   // fix: '! codex login'
  invocation(run: RunSpec): { argv: string[]; env: Record<string, string>; cwd: string }
  parseEvent(line: string): RunEvent | null    // progress for collegium_status
  finalMessage($, runDir: string): Promise<string | null>  // the envelope JSON text (D69)
}
interface RunSpec { runDir: string; dir: string /* the harness's working directory */; write: boolean; prompt: string /* text of <run>/prompt.md */; schemaPath: string /* <run>/schema.json */; model?: string; effort?: string; env: Record<string, string> /* from prepare */ }  // D73
interface Palette { provider: string; models: Model[] }
interface Model { id: string /* provider/model */; hidden: boolean; efforts: string[]; defaultEffort: string }
type RunEvent = { kind: 'message' | 'command' | 'warning' | 'failed'; text: string; at: number }
```

The contract holds every harness-specific fact; `runs.ts`, `choose.ts` and the tools never name a CLI flag.

### INTEGRATION-2: Codex adapter

- `detect`: `$.process.run(['codex', '--version'], { stdin: '' })`; not on PATH → `installed: false`.
- `catalogue`: `codex debug models` (JSON, top key `models`), one palette `openai`; each model `openai/<slug>`, `hidden = visibility === 'hide'`, `efforts = supported_reasoning_levels[].effort`, `defaultEffort = default_reasoning_level` (K1).
- `loginStatus`: `codex login status`, exit 0 logged in, 1 not (D10).
- `invocation`: the D46 argv; `-s read-only` without a write mode, `-s workspace-write` with one; `-C` is the caller's checkout or the run's worktree; `-o <run>/last.json`; `--output-schema <run>/schema.json`; prompt from `<run>/prompt.md` passed as the positional argument, stdin empty; the returned `cwd` is the run directory (INTEGRATION-5).
- `prepare`: returns `{}`, reads no environment and runs nothing; the D63/D64 CI path is removed (D78), so Codex uses the user's own login and `CODEX_HOME`.
- `parseEvent`: JSONL from `--json`; `item.completed` with `item.type == "agent_message"` → message, command items → command, `item.type == "error"` → warning (never a failure), `turn.failed` → failed (D46).
- `finalMessage`: the `-o` file, read with `$.fs.read`; missing or empty → `null`.

### INTEGRATION-3: model and effort choice

`choose.ts`, inputs: the effective palette (catalogue minus `exclude` minus hidden, plus mapped models), the tier map, the caller's `model` and `effort`, the task text.

1. Both given → validate both against the catalogue; an unknown model or an effort the model lacks is an error before launch.
2. Model missing → with a tier map: a `choice` question over `high`/`medium`/`low` (the mapped ones only); without: a `choice` over the palette's model ids. Then effort, unless given.
3. Effort missing → a `choice` over the chosen model's `efforts` (D7, D48).
4. Backend: the copied client with `chooseBackends({ decision_backend }, undefined, keys, 'collegium')`; on `'choose'` take `typesafe` (D56). No key → one `$.model.complete({ model: 'haiku', ... })` asking for `{model, effort}` as JSON; an answer outside the allowed set leaves both to Codex's defaults (D59).

Each `choice` is a decision-client question answered by the backend or Haiku, never by a person, so a headless caller needs nothing extra (D72). The status and result report the backend that chose and whether each value came from the caller or the decision.

### INTEGRATION-4: prompt wrapper and envelope

`<run>/prompt.md` = preamble + task. Preamble (D21, D23), verbatim intent:

```
You run unattended: nobody will answer a question. Never ask one. When something is unclear,
choose, and record the choice under assumptions. If you truly cannot continue, finish with
status "blocked" and say why in summary. User questions and Claude Code subagents are not
available here. Your final message is JSON in the given schema.
```

`<run>/schema.json`:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["status", "summary", "result", "assumptions", "open_questions"],
  "properties": {
    "status": { "type": "string", "enum": ["done", "blocked", "failed"] },
    "summary": { "type": "string" },
    "result": { "type": ["string", "null"] },
    "assumptions": { "type": "array", "items": { "type": "string" } },
    "open_questions": { "type": "array", "items": { "type": "string" } }
  }
}
```

A caller `result_schema` replaces `result`'s schema after the D40 check; a failing check is an error before launch naming the rule broken. A `skill` input copies that `SKILL.md` into `<run>/skill/SKILL.md` with `$ARGUMENTS`, `${CLAUDE_PLUGIN_ROOT}` (derived from the path, D74) and `${CLAUDE_SKILL_DIR}` substituted, and the task text becomes "Read and follow <run>/skill/SKILL.md" plus the arguments (D22, D23). That Codex in `read-only` can read the run directory outside its working directory is strong inference, confirmed by TEST-2.

### INTEGRATION-5: run lifecycle

```
<parent>/<repo-dir-name>.collegium/<run-id>/     D18, D57
  state.json   { id, harness, model, effort, chosenBy, mode, cwd, startedAt, deadline, pid, state, exitCode, branch? }
  prompt.md  schema.json  skill/  events.jsonl  last.json  pid  exit  worktree/ (D39)
```

- `<parent>/<repo-dir-name>` is the git top level of the session root (`$.session.root()`), or the session root outside git.
- States: `running`, then one of `done`, `blocked`, `failed`, `timeout`, `conflict` (envelope status, D19, D24). `failed` carries a reason: launch error, logged out, quota or API error from `turn.failed`, unparsable final message, git error.
- Process: started from the `collegium_run` handler, not awaited, through `$.process.spawn` (D16) as `sh -c 'echo $$ > pid; exec codex …'` with the run directory as its `cwd` (Codex's own working directory is `-C`), so `<run>/pid` holds Codex's pid for `state.json` `pid` (spawn exposes none), events appended to `events.jsonl`, the exit code written to `exit`; the deadline (default 60 min, D19) kills the child and sets `timeout`. Spawn is the only process path; no detached fallback exists (D66).
- Notice: on a terminal state the spawn's completion path submits `Collegium run <id> finished: <state>. Call collegium_result.` through the starting handler's `$` (D67). A submit that resolves `{ drop }` puts the run in a pending set, and the main-thread `turn.complete` (`!e.agentId`) submits the same text for each pending run (D43). A run is notified once: an accepted submit takes it out of the pending set, and a rejected one (a headless session has no session bound) is dropped with it. Only a run whose `collegium_run` `tool.call` had no `agentId` is notified at all (D76).
- Retention: the directory is removed after a `collegium_result` that returned a terminal state; the first Collegium call of a session removes directories whose `pid` is dead and whose state is terminal or whose process vanished (D20). Branches stay.

### INTEGRATION-6: write modes

| `write` | Before | Codex sandbox | After exit |
|---|---|---|---|
| absent | — | `read-only`, `-C` caller's checkout | — |
| `worktree` | `git worktree add --detach <run>/worktree HEAD` | `workspace-write`, `-C <run>/worktree` | worktree kept; result names its path |
| `branch` | `git worktree add -b collegium/<id> <run>/worktree HEAD` | as above | `git add -A`, `git commit -m <summary>`, diffstat, `git worktree remove`; branch kept |
| `merge` | as `branch` | as above | as `branch`, then in the caller's checkout `git merge collegium/<id>` (fast-forward when possible, D50); on conflict `git merge --abort`, state `conflict`, branch kept |

Commits follow D61. Nothing is committed when Codex changed no file; the result says so. A `worktree`-mode run is never swept with its worktree: the sweep skips a run directory whose `worktree/` holds changes and whose mode is `worktree` until `collegium_result` has delivered it.

### API-1: `mcp__collegium__collegium_run`

```json
{
  "type": "object",
  "required": ["task"],
  "properties": {
    "task": { "type": "string", "description": "What to do, or the arguments when skill is given." },
    "skill": { "type": "string", "description": "Absolute path of a SKILL.md to read and follow." },
    "harness": { "type": "string", "enum": ["codex"] },
    "model": { "type": "string", "description": "provider/model, e.g. openai/gpt-6.1-sol" },
    "effort": { "type": "string" },
    "write": { "type": "string", "enum": ["worktree", "branch", "merge"] },
    "cwd": { "type": "string", "description": "Absolute directory Codex works in; default the session's git top level." },
    "result_schema": { "type": "object" },
    "timeout_minutes": { "type": "number", "minimum": 1 }
  }
}
```

Returns at once `{ id, harness, model, effort, chosenBy, mode, runDir }`, or an error string before launch: harness not installed, not enabled (D26 wording), logged out (`! codex login`, D10), invalid schema (D40), unknown model or effort, config error.

### API-2: `mcp__collegium__collegium_status`

Input `{ id }`. Returns `{ id, state, elapsedSec, deadlineSec, model, effort, lastMessages: string[≤3], lastCommands: string[≤5] }` from `state.json` and the tail of `events.jsonl`. Unknown id → error naming it.

### API-3: `mcp__collegium__collegium_result`

Input `{ id, wait_seconds? }`, `wait_seconds` 0–600, default 0 (D53). Returns `{ id, state, envelope?, branch?, diffstat?, worktree?, reason? }` once terminal, else `{ id, state: "running", elapsedSec }` after the wait. The watcher's `timeoutMs` is `wait_seconds` × 1000, and its rejection at that timeout reads as `running`, never as an error. With `wait_seconds` 0 no watcher runs: the answer is read once from `state.json` and, when present, the run's `exit` file, which INTEGRATION-5's process writes. A terminal answer triggers the D20 deletion, except the worktree of a `worktree`-mode run.

### UI-1: `/collegium:run` skill

`skills/run/SKILL.md`, `allowed-tools` naming the three tools and `ToolSearch`. Parses `[--harness h] [--model provider/model] [--effort e] [--write worktree|branch|merge] [--skill <path>] [--wait] <task>`, calls `collegium_run`, prints the id and the chosen model and effort, ends the turn (D58). On the notice it calls `collegium_result` and shows the envelope. With `--wait` it does not end the turn: it calls `collegium_result` with `wait_seconds: 600` until the state is terminal and shows the envelope (D75). A notice for an id whose envelope it already showed is ignored, without a `collegium_result` call (`skills/run/SKILL.md:57-59`).

### UI-2: `/collegium:config` command

`commands/config.md`: detects Codex by running `codex --version`, `codex login status` and `codex debug models` with Bash, shows the palette with hidden models marked (D47), asks scope (user or project), tier mapping and exclusions with `AskUserQuestion`, and writes `${CLAUDE_PLUGIN_DATA}/config.json` or `.claude/collegium.json` with `Write` (D28). It names the `/plugin configure collegium` step when Codex is not enabled (D26).

### INTEGRATION-7: code-review's Codex review

- `plugins/code-review/references/codex-review.md` (new): when the review runs (D35, D38, D45, D49), the task text handed to Codex (paths of `conventions.md`, `scope.json`, `standards.md`, the diff command from `diff_args`, `references/severity.md` as the family and rule table), the `result_schema`:

```json
{ "type": "object", "additionalProperties": false, "required": ["findings"],
  "properties": { "findings": { "type": "array", "items": { "type": "object", "additionalProperties": false,
    "required": ["family", "rule", "severity", "path", "lines", "loss", "fix"],
    "properties": {
      "family": { "type": "string" }, "rule": { "type": "string" },
      "severity": { "type": "string", "enum": ["high", "medium", "nit"] },
      "path": { "type": "string" }, "lines": { "type": "string" },
      "loss": { "type": "string" }, "fix": { "type": "string" } } } } } }
```

  and the rendering into `codex.md`: header `Lens: codex · files judged: <M> of <M>` over the `codex` entry's `files`; each item whose family and rule are rows of `severity.md` as a finding line in the scanner-contract shape; every other item under `## CANDIDATES` (D36); the skip header of D55 otherwise. Codex runs `mode` read-only, `cwd` the `scope.json` `checkout` (D42), `timeout_minutes` 60 (D37).
- `cr-scan --lens codex` (`skills/cr-scan/SKILL.md`): follows `codex-review.md`, calls `collegium_run`, then `collegium_result` with `wait_seconds: 600` until terminal, writes `codex.md` (D52, D53); its `allowed-tools` (`:10`) adds `ToolSearch` and the two Collegium tools it calls (D44).
- `cr-prepare --codex` (`skills/cr-prepare/SKILL.md:9` argument list): adds `{ "lens": "codex", "files": <judged list> }` to `lenses.active` (D52).
- `/start-cr` (`commands/start-cr.md`): Step 2b decides the Codex review from `${user_config.collegium_run}` (D38, D45), tool presence (D35) and, for `ask`, one question; writes the `codex` entry; Step 3 dispatches it as one more unnamed `code-review:scanner` (D52); Step 3's fail-closed rule exempts `codex` (D37); `allowed-tools` adds `ToolSearch` and the three Collegium tools.
- `merge-contract.md` and `cr-merge`: the D55 skip header and Tally clauses; a `codex.md` that is missing or headerless — the scanner itself died — reads as `External review: skipped: codex — no output` (D70), never `incomplete` (D37), except under D71, where no `codex` entry exists; Codex counted outside `Lenses: L of A` (D41).
- `agents/scanner.md:9` `tools:` adds `ToolSearch, mcp__collegium__collegium_run, mcp__collegium__collegium_result` (D44).
- `codex/host.md` "Secrets, conventions, Claude-only names" (`:159-175`): the Codex review does not exist under Codex; never offer or run it.

### CONFIG-3: code-review `collegium_run`

```json
"collegium_run": {
  "type": "string",
  "title": "Codex review through Collegium",
  "description": "Add an OpenAI Codex review to every code review when the collegium plugin is installed with Codex enabled: always, never, or ask each time. Sends the change to OpenAI.",
  "options": ["always", "never", "ask"],
  "default": "ask"
}
```

Added to `plugins/code-review/.claude-plugin/plugin.json` `userConfig` (`:21-` block). The mod does not read it; skills do (D45).

### INTEGRATION-8: fd3 wiring

- `implement-tasks` step 2 (`skills/implement-tasks/SKILL.md:135-154`): when review is offered, read `collegium_run` per D54 and, for unset or `ask`, ask whether the review adds a Codex review; launch passes `codexReview` (`:210-224` args block).
- `implement-run.js`: new arg `codexReview` documented beside `review` (`:25-28`); `prepPrompt` appends `--codex` when it is true (`:1191-1211`); `scanLenses` dispatches `codex` as its own `code-review:scanner` agent beside the single all-lens agent under `SINGLE_SCAN_MAX_FILES` (`:1232`, `:1244-1263`); the `codex` scanner's result never enters `dead`, whatever its closing block says, and its outcome is read from `codex.md` by `cr-merge` (D37, D55); the delta review's `FIX_LENSES` (`:1399`) never includes `codex`.
- The scanner agent's tool list (INTEGRATION-7) is the allow list D44 asks for; gap G5 holds whether it suffices without a permission prompt.

### TEST-1: collegium unit tests

`plugins/collegium/tests/*.test.ts`, `claude-code/testing` kit, `on('process.run', …)` stubs branching on `e.argv`, no `node:` imports (`SPEC.session/research/ci-evals.md`, section 2). Cover: config merge (D60, D27 disable-only), palette filtering (D12, D47), choice paths (D5, D48, D56, D59), strict-schema check (D40), Codex argv (D46), `prepare` returning `{}` with no process or fetch call (D78), event parsing incl. warning-not-failure, state transitions incl. `timeout` and `conflict`, the notice (an accepted submit; a `drop` answer followed by `turn.complete`; one notice per run, D67; a rejected submit dropped and no notice for a run started with an `agentId`, D76), sweep (D20), skill substitution (D23), write-mode git sequences (INTEGRATION-6).

### TEST-2: manual live script

`plugins/collegium/scripts/live-check.sh`: drives `claude -p` with `--plugin-dir plugins/collegium` against real Codex, through `/collegium:run --wait` (D75), for one read-only run, one `branch` run in a scratch repository and one skill run, plus one timeout run that calls `collegium_run` with `timeout_minutes: 1` directly, since UI-1 has no timeout flag (`scripts/live-check.sh:112-125`); prints each run's state and envelope. Shellcheck-clean (lint.yml runs shellcheck on every `*.sh`).

### TEST-3: eval suite — dropped

Dropped by D77; the element code `TEST-3` is not reused. Nothing is built under `plugins/collegium/evals/`.

### TEST-4: fd3 workflow tests

`plugins/fd3/tests/workflows/implement-review.test.mjs`: `codexReview: true` adds `--codex` to the prepare prompt, dispatches a separate `codex` scanner under the single-scan path, and a skipped Codex review merges without a dead-lens verdict.

### TEST-5: phase-1 probes

Three probes recorded in `evidence/spikes.md`: in an interactive session, an un-awaited spawn started from a `tool.call` handler that has already returned, through one later user Stop, and the D29 fallback's `nohup … &` child outliving the `$.process.run` that started it (G1), whether `$.prompt.submit` from the background completion path or a timer is accepted (G2), and `$.process.hookEnv()` returning `CLAUDE_PLUGIN_DATA` (G4).

### CICD-1: CI eval spike

The spike alone (D77): a probe plugin run under `claude plugin eval` on Claude Code 2.1.327, recorded in `evidence/spikes.md`, section G3. Outcome: negative, reached without a CI run, because the eval gives the mod only manifest-default options and refuses `$.http.fetch`. No `collegium` arm, `id-token` permission, `EVAL_*` pass-through or token-guard change goes into `.github/workflows/plugin-evals.yml`.

### CICD-2: unit-test CI job

Already met; nothing is built (D77). `.github/workflows/lint.yml:52-58` ("Run mod tests") runs `claude plugin test` on every plugin directory that has `tests/` and `hooks/hooks.json`, collegium included, at the job's pinned 2.1.327 (`:39`).

### DOCS-1: collegium documentation and registration

`plugins/collegium/README.md` (requirements: Codex CLI, Claude Code 2.1.327 or later (D68); enabling; config file; tools contract; data-leaves-machine note K2), `CHANGELOG.md` with `## [Unreleased]`, `.claude-plugin/plugin.json` at `0.0.0` per `.claude/skills/new-plugin/SKILL.md`, the `marketplace.json` entry, and rows in the root `README.md` plugin and requirements tables. Description per D51.

### DOCS-2: code-review documentation

`README.md` section "Codex review (external)", `CONTEXT.md` term "External review", ADR `docs/adr/0005-codex-external-review.md` recording D35–D38, D41, D52, D55, `CHANGELOG.md` `[Unreleased]`.

### DOCS-3: fd3 documentation

`README.md` line on the step-2 Codex question and `CHANGELOG.md` `[Unreleased]`.

### Prerequisites

| Prerequisite | Status |
|---|---|
| Codex CLI installed and logged in on the author's machine | Met — `codex-cli 0.169.0`, standalone install, `codex login status` exit 0, ChatGPT login (`SPEC.session/research/live-harnesses.md`, Summary). |
| Claude Code with mods and `userConfig` `options` | Collegium needs 2.1.327 or later for `$.process.hookEnv()` (D68); mods need ≥ 2.1.287, `options` ≥ 2.1.271 (`SPEC.session/research/repo-prior-art.md`, section 3). Met locally on 2.1.327, and CI pins 2.1.327 (`.github/workflows/plugin-evals.yml:21`, commit `1954c54b`). |
| `$.process.spawn` holds a 65-minute child | Met in `claude -p` on 2.1.326: 65 of 65 ticks and exit code 7 in 3901 s, no spawn time cap (I25). An un-awaited spawn outlived its handler and a user Stop in an interactive 2.1.327 session (`evidence/spikes.md`, G1). |
| OpenAI WIF provider, service-account mapping and Actions variables (D63) | No longer a prerequisite (D77, D78). They exist unused: created by the user on 2026-11-17, `gh variable list` showing the three `OPENAI_*` variables (I26); their removal is in section 10. |
| TypeSafe or Gemini Decision key | Optional — without one D6's Haiku fallback chooses. |

## 5. Ownership

| Repository / component | Owns | Apply mechanism |
|---|---|---|
| `grixu/cc-toolkit` `plugins/collegium/` | CONFIG-1, CONFIG-2, INTEGRATION-1–6, API-1–3, UI-1, UI-2, TEST-1, TEST-2, DOCS-1 | Pull request to `main`, then `./scripts/release.sh collegium minor` |
| `grixu/cc-toolkit` `plugins/code-review/` | CONFIG-3, INTEGRATION-7, DOCS-2 | Pull request, then `./scripts/release.sh code-review minor` |
| `grixu/cc-toolkit` `plugins/fd3/` | INTEGRATION-8, TEST-4, DOCS-3 | Pull request, then `./scripts/release.sh fd3 minor` |
| `grixu/cc-toolkit` `.github/workflows/`, root `README.md`, `.claude-plugin/marketplace.json` | CICD-2 (existing `lint.yml` step, unchanged), DOCS-1 rows and entry | Same pull request as the plugin they serve |
| `grixu/cc-toolkit` `.ai/specs/collegium/evidence/` | CICD-1's record | Committed on `feat/collegium` with the spec |

One owner (Mateusz Gostański) reviews and merges everything. Releases go only through `scripts/release.sh` (repository `CLAUDE.md`, "Releasing"), which bumps the marketplace version per release. A live run of code-review or fd3 uses the installed release, not the branch (user memory `fd3-run-tuning-0925.md`), so each integration is verified live only after the plugin it depends on is released. Collegium has no CI eval (D77); its mod tests run in `lint.yml` on every pull request.

## 6. The change, per repository

All items are in `grixu/cc-toolkit`.

### `plugins/collegium` (new)

| # | Work item | Elements | Files | Kind | Phase | Lands as |
|---|---|---|---|---|---|---|
| C1 | Phase-1 probes: the interactive, outlives-its-handler case of G1, probe `$.prompt.submit` after the handler returned and `$.process.hookEnv()`; record in `evidence/spikes.md` | TEST-5 | `.ai/specs/collegium/evidence/spikes.md` | new | 1 | one commit on the spec — landed, `b7dc87bf` |
| C2 | Scaffold: manifest with `userConfig`, `hooks.json`, CHANGELOG, README skeleton, marketplace entry | CONFIG-1, DOCS-1 | `plugins/collegium/.claude-plugin/plugin.json`, `hooks/hooks.json`, `CHANGELOG.md`, `README.md`, `.claude-plugin/marketplace.json` | new | 2 | one PR |
| C3 | Decision client copy, byte-identical to dev-kit's | INTEGRATION-3 | `hooks/decision.ts`, `hooks/providers/{index,gemini,typesafe}.ts` | new | 2 | one PR |
| C4 | Config read and merge | CONFIG-2 | `hooks/config.ts` | new | 2 | one PR |
| C5 | Adapter contract and Codex adapter | INTEGRATION-1, INTEGRATION-2 | `hooks/harness.ts`, `hooks/codex.ts` | new | 2 | one PR |
| C6 | Model and effort choice | INTEGRATION-3 | `hooks/choose.ts` | new | 2 | one PR |
| C7 | Prompt wrapper, envelope, strict-schema check, skill substitution | INTEGRATION-4 | `hooks/prompt.ts` | new | 2 | one PR |
| C8 | Run lifecycle, spawn process (D66), notice (D67), sweep | INTEGRATION-5 | `hooks/runs.ts` | new | 2 | one PR |
| C9 | Tools and registration | API-1, API-2, API-3 | `hooks/register.ts` | new | 2 | one PR |
| C10 | Write modes | INTEGRATION-6 | `hooks/write.ts` | new | 2 | one PR |
| C11 | `/collegium:run` and `/collegium:config` | UI-1, UI-2 | `skills/run/SKILL.md`, `commands/config.md` | new | 2 | one PR |
| C12 | Unit tests | TEST-1 | `tests/*.test.ts` | new | 2 | one PR |
| C13 | Manual live script | TEST-2 | `scripts/live-check.sh` | new | 2 | one PR |
| C14 | README in full, root README rows, description through D51 | DOCS-1 | `plugins/collegium/README.md`, `README.md`, `plugin.json`, `marketplace.json` | changed | 2 | one PR |
| C15 | CI spike: probe plugin under `claude plugin eval`, outcome negative (D77) | CICD-1 | `.ai/specs/collegium/evidence/spikes.md` (section G3) | new | 3 | one commit on the spec — landed, `aabcaafd`; no spike branch was made |
| C16 | Dropped (D77): no eval suite, no eval arm and no new job; no README note, since the collegium README names no eval (the user's answer, 2026-11-18, P4 writing report, question 2) | TEST-3, CICD-2 | — | removed (never built) | 3 | nothing lands |
| C17 | Remove the WIF CI path: `prepare` returns `{}`; delete `TOKEN_EXCHANGE_URL`, `ciFailure`, `fetchTokenField`; drop `CI_ENV`, the `fetched` helper and the four CI tests, keeping one test that `prepare` returns `{}` and calls nothing (D78) | INTEGRATION-2, TEST-1 | `plugins/collegium/hooks/codex.ts:1,5,60-121`, `plugins/collegium/tests/codex.test.ts:1-18,140-234` | changed | 3 | one PR (PR 1, with phases 1–2, D62) |

### `plugins/code-review`

| # | Work item | Elements | Files | Kind | Phase | Lands as |
|---|---|---|---|---|---|---|
| R1 | `collegium_run` option | CONFIG-3 | `.claude-plugin/plugin.json:21-` | changed | 4 | one PR |
| R2 | Codex review reference | INTEGRATION-7 | `references/codex-review.md` | new | 4 | one PR |
| R3 | `cr-scan --lens codex`, `cr-prepare --codex` | INTEGRATION-7 | `skills/cr-scan/SKILL.md`, `skills/cr-prepare/SKILL.md:9,81-114` | changed | 4 | one PR |
| R4 | `/start-cr` Steps 2b, 3, fail-closed exemption, `allowed-tools` | INTEGRATION-7 | `commands/start-cr.md:16-17,194-215,217-287` | changed | 4 | one PR |
| R5 | Merge skip semantics and Tally | INTEGRATION-7 | `references/merge-contract.md:13-20,265,359-365`, `skills/cr-merge/SKILL.md:28-34` | changed | 4 | one PR |
| R6 | Scanner tools; Codex-host skip | INTEGRATION-7 | `agents/scanner.md:9`, `codex/host.md:159-175` | changed | 4 | one PR |
| R7 | README, CONTEXT, ADR 0005, CHANGELOG | DOCS-2 | `README.md`, `CONTEXT.md`, `docs/adr/0005-codex-external-review.md`, `CHANGELOG.md` | changed / new | 4 | one PR |

### `plugins/fd3`

| # | Work item | Elements | Files | Kind | Phase | Lands as |
|---|---|---|---|---|---|---|
| F1 | Step-2 question and `codexReview` launch arg | INTEGRATION-8 | `skills/implement-tasks/SKILL.md:135-154,210-224` | changed | 5 | one PR |
| F2 | Workflow: arg, `--codex` prepare, separate Codex scanner, skip handling | INTEGRATION-8 | `workflows/implement-run.js:25-28,1191-1263,1300-1356` | changed | 5 | one PR |
| F3 | Workflow tests | TEST-4 | `tests/workflows/implement-review.test.mjs` | changed | 5 | one PR |
| F4 | README and CHANGELOG | DOCS-3 | `README.md`, `CHANGELOG.md` | changed | 5 | one PR |

## 7. Rollout

| # | Phase | Where | Switches anything? | Gate after? |
|---|---|---|---|---|
| 1 | Probes: spawn spike result, notice delivery, `hookEnv` (C1) | Local | No | No |
| 2 | collegium plugin (C2–C14) | `feat/collegium` | No — new plugin, Codex disabled by default (D26) | No |
| 3 | CI spike (C15, landed negative), no eval and no new job (C16, D77), WIF CI path removed (C17, D78) | Local, then `feat/collegium` | No | Yes — PR 1 merged, `release.sh collegium minor` (v0.1.0), installed locally |
| 4 | code-review integration (R1–R7) | New branch stacked on `main` after PR 1 merged | Yes — reviews offer or run Codex per `collegium_run` | Yes — PR 2 merged, `release.sh code-review minor`, installed |
| 5 | fd3 integration (F1–F4) | New branch after PR 2 merged | Yes — fd3 asks about or runs the Codex review | Yes — PR 3 merged, `release.sh fd3 minor` |

Orderings: phase 2 needed phase 1's answers in C4's and C8's design before they were written (a development ordering); phase 1 landed on 2026-11-18 (`b7dc87bf`) and its answers are D66–D68. Inside phase 2, C10 is written before C8 and C9, which call it: `runs.ts` sets `conflict` from the write step and `register.ts` takes the `write` input (a development ordering). Phase 4 needs collegium **released and installed** before its live check (a deploy ordering); its merge does not need it, because the review is tool-gated (D35, D49). Phase 5's `--codex` prepare needs code-review's R3 **released and installed** before fd3's live check; fd3's merge does not need it, but an fd3 release that passes `--codex` to a code-review without R3 hands prepare an argument it does not define (`plugins/code-review/skills/cr-prepare/SKILL.md:21-31`), so phase 5 **merges after** phase 4's release. No environments other than the author's machine and CI exist; there is no bake period beyond the live checks in section 8.

Size of landing unit 1 (phases 1–3): measured at `5a475c27`, 32 files and 4,371 added lines against `origin/main`, with no eval files; C17 removes about 150 lines of that (`codex.ts:60-121` and the four CI tests). The user chose not to subdivide it (D62): phases 1–3 land as one pull request.

Rollback: phase 2 and 3 switch nothing (Codex disabled by default). Phase 4 reverses by `collegium_run: never` per user, or by reverting PR 2 and releasing code-review again. Phase 5 reverses by answering no at step 2, or reverting PR 3 and releasing fd3. A reverted plugin release is complete once the marketplace version is bumped by `release.sh` and the user runs a plugin update.

## 8. Verification

| Element | Check | Where it runs | Before the change | After |
|---|---|---|---|---|
| CONFIG-1 | `claude plugin validate plugins/collegium/ --strict` (the `/verify` skill) | Branch | Plugin absent | Valid; `/plugin configure collegium` shows a Codex toggle, off |
| CONFIG-2 | TEST-1 config-merge cases | Branch | — | Pass; project file cannot enable a disabled Codex |
| INTEGRATION-1, INTEGRATION-2 | TEST-1 argv and event-parse cases; TEST-2 read-only run | Branch; author's machine | — | Pass; live run `done` |
| INTEGRATION-3 | TEST-1 choice cases; TEST-2 prints `chosenBy` | Branch; author's machine | — | Pass; a run with no model given names the backend that chose |
| INTEGRATION-4 | TEST-1 schema-check and substitution cases; TEST-2 skill run | Branch; author's machine | — | Pass; skill run's envelope `done` |
| INTEGRATION-5 | TEST-1 state and sweep cases; observed only: a 60-minute run reaching `timeout` with `timeout_minutes: 1` in TEST-2 | Branch; author's machine | — | Pass; state `timeout`, process gone |
| INTEGRATION-6 | TEST-1 git sequences; TEST-2 `branch` run in a scratch repository | Branch; author's machine | — | `git branch --list 'collegium/*'` shows the branch, worktree removed |
| API-1–3 | TEST-1 tool-call cases with `$.tool.call`; TEST-2 status while running | Branch; author's machine | Tools absent | Pass; status shows elapsed and last message |
| UI-1 | Triggered: TEST-2's three runs through `/collegium:run --wait` (D75, D77) | Author's machine | — | Each run prints a terminal state and its envelope |
| UI-2 | Triggered: run `/collegium:config`, choose project scope | Author's machine | No config file | `.claude/collegium.json` written with the chosen tiers |
| TEST-5 | Probe transcripts in `evidence/spikes.md` | Author's machine | G1, G2, G4 open | Each of G1, G2, G4 recorded as yes or no |
| CICD-1 | The spike record in `evidence/spikes.md`, section G3 | Branch (committed record) | G3 open | Recorded negative, `aabcaafd` — met |
| CICD-2 | `lint.yml` "Run mod tests" step on PR 1 | CI, on PR 1 | — | `claude plugin test plugins/collegium/` group green |
| INTEGRATION-2 (C17) | `grep -n 'EVAL_\|oauth/token' plugins/collegium/hooks/codex.ts`; TEST-1 `prepare` case | Branch | Five `EVAL_*` reads and `TOKEN_EXCHANGE_URL` | No match; `prepare` returns `{}` |
| CONFIG-3, INTEGRATION-7 | Triggered: `/start-cr` on a one-file change with collegium installed, Codex enabled, `collegium_run: always` | Author's machine after phase-3 release | No `codex.md` | `codex.md` in the context directory; Tally shows `External review: codex` |
| INTEGRATION-7 skip | Triggered: same with Codex disabled | Author's machine | — | Tally shows `External review: skipped: codex — <reason>` (D70); no menu |
| INTEGRATION-8, TEST-4 | `node --test 'plugins/fd3/tests/workflows/*.test.mjs'`; triggered: an fd3 run with `codexReview: true` | Branch (fd3-evals.yml runs it); author's machine after phase-4 release | — | Pass; the run's review dir holds `codex.md` |
| DOCS-1–3 | `/verify` and the description passes of D51 | Branch | — | `/verify` clean |

Every phase has a row: phase 1 TEST-5, phase 2 the collegium rows, phase 3 CICD-1, CICD-2 and the C17 row, phase 4 the code-review rows, phase 5 the fd3 rows. No element is without a row; TEST-3 is dropped (D77) and has none.

## 9. Cleanup

- No CI spike branch exists: C15 ran locally, and its probe plugin sits in the session folder, outside the commit.
- The session's spike processes and scratch plugins (`spike-spawn`, `spike-subagent`) are outside any repository and need no cleanup in it.
- Runtime cleanup is part of the design (D20), not a rollout step. A swept run directory is gone for good; its write-mode branch is not touched, and re-creating a run with the same id cannot happen because ids carry a timestamp and random suffix (D57).

## 10. Out of scope

| Item | Owner | Placement |
|---|---|---|
| Further harnesses: oh-my-pi, Cursor, Gemini, droid | Mateusz Gostański | Deferred list in the closing notes; no tracker issue (`gh issue list`, 2026-11-17, shows #1 and #9 only) |
| Claude as an external harness | Mateusz Gostański | Same |
| Harness update handling (D9) | Mateusz Gostański | Same |
| Cost and limit accounting | Mateusz Gostański | Same |
| Session resume | Mateusz Gostański | Same |
| The reverse direction (calling Collegium from Codex) | Mateusz Gostański | Same |
| A concurrency limit (D30) | Mateusz Gostański | Same |
| Moving `codex-plan-improver` onto Collegium | Mateusz Gostański | Same |
| Docs-site pages for collegium (`docs/src/content/docs/plugins/<name>/`, EN and PL) — surfaced during analysis | Mateusz Gostański | Not placed; the site is hand-written per plugin (`SPEC.session/research/ci-evals.md`, section 5) |
| A `.claude/rules/collegium.md` contributor rule — surfaced during analysis | Mateusz Gostański | Not placed; the repository's `CLAUDE.md` asks for one only for complex conventions |
| Deleting the now-unused OpenAI WIF provider, its service-account mapping and the Actions variables `OPENAI_WIF_AUDIENCE`, `OPENAI_IDENTITY_PROVIDER_ID`, `OPENAI_SERVICE_ACCOUNT_ID` (D78) — surfaced during analysis | Mateusz Gostański | Not placed; OpenAI dashboard and `gh variable delete -R grixu/cc-toolkit`, outside the repository |
| A promptfoo eval case for code-review's Codex review — surfaced during analysis | Mateusz Gostański | Not placed; code-review's evals run locally only (`SPEC.session/research/ci-evals.md`, section 1B) |

## 11. Tickets

The tracker holds two open issues, #1 (awesome-codex-plugins listing) and #9 (code-review comment-track evals), neither about this work (`gh issue list -R grixu/cc-toolkit --state all`, 2026-11-17). No ticket exists for collegium, and this spec creates none.

## 12. Appendix — the evidence record

| Claim | How it was verified |
|---|---|
| Codex 0.169.0 is installed and logged in; cursor-agent has no models; droid auth unknown | `command -v`, `--version`, `codex login status` exit 0 (`SPEC.session/research/live-harnesses.md`, Summary). |
| Codex catalogue: slugs, `visibility`, per-model efforts, `ultra` missing on luna and hidden models | `codex debug models` JSON (`SPEC.session/research/live-harnesses.md`, Models and effort; raw `SPEC.session/research/codex-models.json`). |
| Codex models depend on the account's plan | learn.chatgpt.com/docs/models (`SPEC.session/research/harness-docs.md`, models answer). |
| `codex debug models` is a 300 s cached call that fetches when stale | Source `codex-rs/models-manager/src/cache.rs` at `rust-v0.169.0` and timing runs (`SPEC.session/research/codex-skills.md`, question 4). |
| `codex exec` flags of D46; warnings arrive as `item.type == "error"` and are not failures | `codex exec --help` and a live trial, exit 0 in 6 s (`SPEC.session/research/live-harnesses.md`, Headless, Trial run). |
| A question ends a `codex exec` run; exec approval policy is `never`; `request_user_input` is rejected | `plugins/code-review/README.md:344-346`; `codex-rs/exec/src/lib.rs` at `rust-v0.169.0` (`SPEC.session/research/codex-skills.md`, question 2). |
| `codex login status` exits 0 or 1; logged-out exec fails after about 15 s of 401 retries | Docs quote and a probe with an empty `CODEX_HOME` (`SPEC.session/research/harness-docs.md`, auth answer). |
| `--output-schema` is strict mode and is validated only as JSON locally | `codex-rs/codex-api/src/common.rs`, `exec/src/lib.rs` `load_output_schema` at `rust-v0.169.0` (`SPEC.session/research/codex-skills.md`, question 3; quote in `evidence/12-appendix.md`). |
| Codex cannot commit inside `workspace-write`, worktree or not | learn.chatgpt.com/docs/agent-approvals-security and `protocol/src/permissions.rs` (`SPEC.session/research/codex-skills.md`, question 5). |
| Codex has no per-run skill flag and substitutes no Claude Code variables | `codex-rs/skills/src/parser.rs`, `config/src/skills_config.rs`; probe skill loaded with literal `${CLAUDE_PLUGIN_ROOT}` (`SPEC.session/research/codex-skills.md`, questions 1–2). |
| Codex `read-only` can read the run directory outside `-C` | Strong inference: read-only is a write restriction; no doc line states reads outside the workspace; confirmed by TEST-2's skill run. |
| `$.process.run`: argv only, default 30 s, max 10 min; time inside it is outside the 10 s budget; `$.clock.sleep` counts | `claude-code.d.ts` and mods reference (`SPEC.session/research/mod-api.md`, section 1; quote in `evidence/12-appendix.md`). |
| An awaited `$.process.spawn` in a `tool.call` hook delivers its stream and exit code across 65 minutes | Spike in `claude -p` on 2.1.326: tool result `{"ticks":65,"expectedTicks":65,"exitCode":7,"wallSec":3901}`; the run's exit 1 was the account's 5-hour usage limit on the model's last turn (`SPEC.session/research/spike-spawn.md`, Verdict; raw `SPEC.session/research/spike-spawn/out/real.jsonl`; quote in `evidence/12-appendix.md`). |
| A spawn child is killed only by leaving its loop, `return()`, a `next.signal` abort or module unload — "a hook's return included" does not | `claude-code.d.ts` 4185-4187 as quoted in `SPEC.session/research/spike-spawn.md`, Bounds; a returned handler and a user Stop exercised live on 2.1.327 (`evidence/spikes.md`, G1). |
| Mod tools are served as an HTTP MCP server; the 30-min/5-min MCP idle timeout did not cut a 65-minute call on 2.1.326 | `real.debug.log` and the binary's `rd` function (`SPEC.session/research/spike-spawn.md`, Bounds). Why it did not apply is unexplained; `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT=0` disables it if it ever does. |
| Chained `$.process.run` in one `tool.call` ran to 1200 s | Live probe on 2.1.322, user memory `cc-mod-tool-duration.md` (`SPEC.session/research/mod-api.md`, section 1). |
| Mod tools are callable from Agent-tool subagents and workflow `agent()` calls; `$.prompt.submit` is refused inside `tool.call` | Live probes 1–3 on 2.1.326 (`SPEC.session/research/mod-tools-subagents.md`, Verdict, Live probe; refusal text in `evidence/12-appendix.md`). |
| `$.process.hookEnv()` returns `CLAUDE_PLUGIN_DATA` on 2.1.326 and 2.1.327 and does not exist on 2.1.322, 2.1.323 and 2.1.325 (D68) | Probe of 2026-11-18, `throw: $.process.hookEnv is not a function` on the older three (`evidence/spikes.md`, G4); signature at `SPEC.session/research/claude-code.d.ts:4234`. |
| An un-awaited `$.process.spawn` started in a `tool.call` handler survives the handler's return and a later user Stop in an interactive session, delivering every chunk and the exit (D66) | Probe on 2.1.327, 2026-11-18: 90 of 90 chunks and `{"code":7,"signal":null}` after Esc (`evidence/spikes.md`, G1 timeline). Closing Claude Code was not tested; D16 accepts that it kills the child. |
| `$.prompt.submit` through a returned handler's `$` starts a turn in an idle session; after a user Stop with no input since it resolves `{"drop":"the session was stopped and nobody has sent input since"}` and starts none (D67) | Probe on 2.1.327, two runs, from a `$.clock.after` timer and from the spawn's completion path (`evidence/spikes.md`, G2). |
| A submit made while a turn is running waits for the session to go idle | `SPEC.session/research/claude-code.d.ts:3440-3441` ("a turn of its own, once the session is idle"); doc only, not probed. Whichever way the host answers, D67's `drop` rule covers a refusal. |
| `$` cannot be kept in a variable for later use | `claude plugin validate` refuses `sessionDollar = $`: "$ itself is assigned (bound, passed, spread, returned or read)" (`evidence/spikes.md`, G2). |
| Claude Code 2.1.327 is installed on the author's machine (D68) | `claude --version` → `2.1.327 (Claude Code)`, 2026-11-18. |
| A hooks module has no Node, so `finalMessage` reads the `-o` file through `$.fs` (D69) | `SPEC.session/research/claude-code.d.ts:23-24` ("no DOM, no Node"); as built at `plugins/collegium/hooks/codex.ts:163-166` (`d25540bb`). |
| As built, a switched-off Codex review leaves no trace and a skipped one reads `External review: skipped: codex — <reason>` (D70, D71) | Branch `feat/code-review-codex-review` at `c8e73867`: `plugins/code-review/references/codex-review.md:27-29`, `plugins/code-review/references/merge-contract.md:274,374-375`. |
| `choice` is a decision-client question type (D72) | `plugins/collegium/hooks/decision.ts:11` at `d25540bb`, byte-identical to dev-kit's copy (D6). |
| As-built `RunSpec` and plugin-root rule (D73, D74) | `plugins/collegium/hooks/harness.ts:23-32` and `plugins/collegium/hooks/prompt.ts:98-103` at `d25540bb`. |
| `userConfig` has no object type; unsaved values stay literal in skills, `default` ignored there | code.claude.com/docs/en/plugins-reference.md (`SPEC.session/research/harness-docs.md`, userConfig answer); user memory `cc-userconfig-skill-substitution.md`. |
| `claude plugin configure <plugin> --json` shows non-sensitive saved values (≥ 2.1.285) | code.claude.com/docs/en/plugins/cli-reference.md (`SPEC.session/research/harness-docs.md`, userConfig answer); not run, gap G6. |
| The decision client is byte-identical in dev-kit, pr-proof and code-review | `cmp` of `hooks/decision.ts` and `hooks/providers/{index,gemini,typesafe}.ts` across the three plugins, run 2026-11-17, all equal. |
| Keys fall back to `TYPESAFE_API_KEY`, `GEMINI_DECISIONS_API_KEY`, `GEMINI_API_KEY`; `auto` with two keys returns `choose` | `plugins/dev-kit/hooks/providers/index.ts:33-39,60-67`. |
| Jev model id `jev-1.14.0` | `plugins/dev-kit/hooks/providers/typesafe.ts:3`. |
| Haiku via `$.model.complete` from a mod has a precedent | `plugins/dev-kit/hooks/register.ts:454` with `SLICING_MODEL = 'haiku'` at `:64`. |
| The merge reads only `lenses.active` and each `<lens>.md`, failing `incomplete` on a missing or headerless file | `plugins/code-review/skills/cr-merge/SKILL.md:28-34`; `plugins/code-review/references/merge-contract.md:13-20`. |
| A `files judged: 0 of M` header reads as undelivered | `plugins/code-review/references/merge-contract.md:16-17`. |
| Convergence of independent lenses raises confidence, never severity | `plugins/code-review/references/merge-contract.md:55-62`. |
| Tally shape `Lenses: L of A (skipped: …)` | `plugins/code-review/references/merge-contract.md:265,359-365`. |
| `/start-cr` lens set is input-gated; fail-closed menu for any undelivered lens | `plugins/code-review/commands/start-cr.md:6,274-286`; ADR `plugins/code-review/docs/adr/0002-active-lens-set-and-standards.md`. |
| `/start-cr` dispatches unnamed `code-review:scanner` agents in one message and waits by ending its turn | `plugins/code-review/commands/start-cr.md:217-235,265-273`. |
| `cr-prepare` arguments and `scope.json` shape | `plugins/code-review/skills/cr-prepare/SKILL.md:9,81-114`. |
| `cr-scan` writes only `<context>/<lens>.md` under a `Lens:` header and dispatches nothing | `plugins/code-review/skills/cr-scan/SKILL.md:54-66`. |
| The scanner agent's tools are `Skill, Read, Grep, Glob, Bash, Write` | `plugins/code-review/agents/scanner.md:9`. |
| Under Codex, mods do not exist and Claude-only commands are never offered | `plugins/code-review/codex/host.md:159-175`; `SPEC.session/research/code-review-integration.md`, section 5. |
| code-review's `userConfig` uses `options` enums and starts at `plugin.json:21` | `plugins/code-review/.claude-plugin/plugin.json:21-33`. |
| fd3 reviews through `cr-prepare`/`cr-scan`/`cr-merge` agents, one agent for all lenses at three files or fewer | `plugins/fd3/workflows/implement-run.js:1191-1263,1300-1356`; `SINGLE_SCAN_MAX_FILES` at `:1232`. |
| fd3's `review` arg and step-2 question | `plugins/fd3/workflows/implement-run.js:25-28,64`; `plugins/fd3/skills/implement-tasks/SKILL.md:135-154,210-224`. |
| Only `EVAL_*` variables reach an eval run; mods run outside the agent sandbox; mod visibility of `EVAL_*` undocumented | code.claude.com/docs/en/plugin-evals.md (`SPEC.session/research/ci-evals.md`, section 4; doc copy `SPEC.session/research/plugin-evals-doc.md`). |
| The eval workflow's opt-in points, CC pin and token guard; the pin is 2.1.327 (D68) | `.github/workflows/plugin-evals.yml:4-10,21,42,47-55,105-115,143-146`; `:21` reads `CLAUDE_CODE_VERSION: 2.1.327` since commit `1954c54b`, a one-line change that moves no other cited line. |
| No CI job ran `claude plugin test` at `d7f6da87` | Workflow list `code-review-scripts, docs, fd3-evals, lint, plugin-evals, pullfrog, sync-hookify` (`SPEC.session/research/ci-evals.md`, section 2). Since `49c95c62` (#64, 2026-11-18, not an ancestor of `d7f6da87`) `lint.yml` runs it (next row). |
| `lint.yml` runs `claude plugin test` on every plugin with `tests/` and `hooks/hooks.json`, at 2.1.327, so CICD-2 builds nothing (D77) | `.github/workflows/lint.yml:39` (`CLAUDE_CODE_VERSION: 2.1.327`), `:52-58` ("Run mod tests" loop) read at `5a475c27`; the step came from `49c95c62`, the pin from `fe96e351`. |
| Inside `claude plugin eval` the mod sees `EVAL_*`, gets only manifest-default `options`, is refused `$.http.fetch`, and its `$.process.run` children reach the network (D77) | Probe on 2.1.327, 2026-11-18, one run (`evidence/spikes.md`, section G3, `aabcaafd`; probe source in `SPEC.session/research/spike-eval-probe/`). No case field or flag sets a plugin option per `claude plugin eval --help` and the case field tables. |
| The WIF CI path is triggered only by `EVAL_ACTIONS_ID_TOKEN_REQUEST_TOKEN` and is the only `$.http.fetch` user outside the decision client (D78) | `plugins/collegium/hooks/codex.ts:5,60-121` read at `5a475c27`; repo-wide `search_code` for `EVAL_\|oauth/token\|http\.fetch` under `plugins/collegium` hits only `codex.ts`, `decision.ts:54` and tests. |
| Repo secrets hold no `OPENAI_API_KEY` | `gh secret list -R grixu/cc-toolkit`, 2026-11-17 (`SPEC.session/research/INDEX.md` entry I23, inline). |
| The workflow grants only `contents: read`; the eval job starts at `:57` | `.github/workflows/plugin-evals.yml:13-14,57`, read at `d7f6da87`. |
| WIF exchange: endpoint, token-exchange body, Bearer `access_token`, no refresh token, never outlives the subject JWT; authorizes like a service-account key | developers.openai.com/api/reference/workload-identity-federation (`SPEC.session/research/openai-wif.md`, "Token exchange"; quotes in `evidence/12-appendix.md`). |
| The job needs `id-token: write`; the JWT comes from `ACTIONS_ID_TOKEN_REQUEST_URL` + `&audience=` with the request token as bearer; ids are variables, not secrets | developers.openai.com/api/docs/guides/workload-identity-federation/github-actions (`SPEC.session/research/openai-wif.md`, "GitHub Actions side"). |
| A GitHub OIDC JWT lives 300 s, so an exchanged token lives about 5 minutes (K7) | docs.github.com/en/actions/concepts/security/openid-connect example `iat`/`exp`; google-github-actions/auth#474 (`SPEC.session/research/openai-wif.md`, "GitHub OIDC token lifetime"). The 300 s is read from an example token, not a stated limit. |
| Codex's native WIF path is a ChatGPT-workspace beta, not usable here | WIF guide's Codex section (`SPEC.session/research/openai-wif.md`, "Codex native WIF"). |
| `codex login --with-api-key` accepting a WIF access token | Never tested: C15 stopped before WIF was reached (G3 closed negative), and D78 removes the path; inference only. |
| The WIF provider, mapping and three Actions variables exist | `gh variable list -R grixu/cc-toolkit` by the user, 2026-11-17 (`SPEC.session/research/openai-wif.md`, "Repository state"); mapping assertions not read back. |
| A mod can make HTTP requests through `$.http.fetch` | `plugins/dev-kit/hooks/decision.ts:54`. |
| `gpt-6-luna` is "Fast and affordable model for easier tasks"; `low` is "Fast responses with lighter reasoning" (D65) | `jq` over `SPEC.session/research/codex-models.json` (`description`); `SPEC.session/research/live-harnesses.md`, effort descriptions. |
| New-plugin scaffold and marketplace entry shape; marketplace at 1.17.0 with 11 plugins at `d7f6da87` (1.19.0 with 12, collegium at `0.0.0`, at `d25540bb`) | `.claude/skills/new-plugin/SKILL.md`; `.claude-plugin/marketplace.json:4`, `jq '.plugins\|length'` = 11. |
| fd3 worktrees live beside the repository as `<repo>.worktrees/` | `plugins/fd3/workflows/implement-run.js:77`. |
| Landing unit 1 exceeds the size the user reviews in one PR | Measured: `git diff --shortstat origin/main...5a475c27 -- plugins/collegium .claude-plugin README.md .github` → 32 files, 4,371 insertions, 2 deletions. The earlier estimate (C2–C16, 317-line decision copy) is replaced by this. |

### Declared gaps

| # | Gap | Owner | Placement |
|---|---|---|---|
| G5 | Whether naming the Collegium tools in `agents/scanner.md` `tools:` lets a workflow scanner call them without a permission prompt. Substitute: the phase-5 triggered fd3 run; a denied call shows as `External review: skipped: codex — permission denied` (D55, D70), never as a dead review. | Spec team | Phase 5 verification row |
| G6 | Whether `claude plugin configure code-review --json` prints the saved `collegium_run` on the installed version. Rule: printed → D54; not → step 2 asks whenever Collegium is installed with Codex enabled. | Spec team | Phase 5, F1 |

G1, G2 and G4 closed on 2026-11-18 by the phase-1 probes (`evidence/spikes.md`); their answers are D66, D67 and D68. G3 closed negative on 2026-11-18 by C15 (`evidence/spikes.md`, section G3); its answer is D77.

### Validation 2026-11-17 (validate-spec pass 1)

Verdict: not ready — claims: 34 verified / 6 deferred / 0 blocked, 1 open (D61, handed to the user) — spec 610 lines at this verdict
Checked at: grixu/cc-toolkit @ d7f6da87 (origin/main, fetched 2026-11-17)

| Claim | How it was verified |
|---|---|
| Every `path:line` in sections 1–8 and 12 resolves to what it is cited for | Printed each cited line at `d7f6da87`; `implement-run.js` symbols located in the code graph (`prepPrompt` 1191, `SINGLE_SCAN_MAX_FILES` 1232, `scanLenses` 1244-1263, `runReview` 1300-1356, `FIX_LENSES` 1399). No drift. |
| Decision client byte-identical in three plugins; 317 lines; `jev-1.14.0` | `cmp` of the four files, dev-kit against pr-proof and code-review: all equal; `wc -l` 317; `providers/typesafe.ts:3`. |
| Codex catalogue facts behind D7, D47, D59 | `jq` over `SPEC.session/research/codex-models.json`: `gpt-reserve`, `codex-auto-review` `hide`; `ultra` absent on both luna models and both hidden ones. |
| 65-minute spawn spike (K3, I25) | `spike-spawn/out/real.jsonl` holds `"ticks":65,…,"exitCode":7,…,"wallSec":3901`. |
| Codex `0.169.0` exists for CICD-1's pnpm install | `pnpm view @openai/codex@0.169.0 version` → `0.169.0`; local `codex --version` → `codex-cli 0.169.0`. |
| Landing (check 9): PR then `release.sh`, scaffold at `0.0.0`, CI opt-in points | `scripts/release.sh` header; `.claude/skills/new-plugin/SKILL.md:27`; `.github/workflows/plugin-evals.yml`, `lint.yml` (shellcheck on every `*.sh`), `fd3-evals.yml` (`node --test` on `tests/workflows`); marketplace `1.17.0`, 11 plugins. |
| Finding (blocking, open): D61 says Collegium never bypasses hooks, but a mod's git runs with repo hooks off | `claude-code.d.ts` `process.run`: "Git runs with repo hooks off" (`SPEC.session/research/mod-api.md`, section 1, Git row). Repair choice handed to the user. |
| Finding (blocking, closed): D29's fallback names `setsid`, absent on macOS, and runs Codex in the foreground of a `$.process.run` | `command -v setsid` empty on Darwin 25.6.0; d.ts: `run` holds the call while a child writes and kills it at the timeout. D29, INTEGRATION-5, TEST-5 and G1 edited. |
| Finding (blocking, closed): a missing `codex.md` or a dead `codex` scanner would hold an fd3 branch as `incomplete` or `dead` | `cr-merge/SKILL.md:28-34` and `implement-run.js` `lensDead`, `runReview:1334`; INTEGRATION-7 and INTEGRATION-8 now read it as `skipped: codex` (D37). |
| Finding (blocking, closed): phase 2 listed C10 after C8 and C9, which call `write.ts` | INTEGRATION-5 `conflict` state and API-1 `write` input; ordering sentence added to section 7. |
| Finding (non-blocking, closed): `cr-scan` grants no permission for the Collegium tools | `cr-scan/SKILL.md:10` `allowed-tools: Read, Bash, Grep, Glob, Write`; INTEGRATION-7 adds them; G5 still decides whether that suffices. |
| Finding (non-blocking, closed): C16 lands in "the phase-2 PR", but phases 1–3 are one PR (D62) | Cell corrected to PR 1. |
| Finding (non-blocking, closed): "would fail prepare on unknown arguments" has no source | `cr-prepare/SKILL.md:21-31` defines its arguments and says nothing about unknown ones; the sentence now says what is known. The merge ordering it supports stands. |
| Finding (non-blocking, open): a fourth byte-identical copy keeps `decision.ts:1-3` naming three plugins | `plugins/dev-kit/hooks/decision.ts:1-3`; fixing it touches dev-kit, pr-proof and code-review too. |
| Finding (non-blocking, open): a 600 s wait inside a `$.process.run` capped at 600 s rejects at the cap | d.ts `run`: rejects when still running at the timeout; C9 reads a rejected wait as `running`. |
| Finding (non-blocking, open): three section 10 rows read "Not placed" | Owner named; no ticket or gate. |
| D61 hooks-off repair: the user chose option (a), accept the risk (2026-11-17) | D61 reworded, and risk K5 added to section 3. The finding stays blocking in this record; it is closed by that repair. |

Verdict: ready — claims: 35 verified / 6 deferred / 0 blocked — spec 614 lines at this verdict

### Validation 2026-11-17 (validate-spec pass 2)

Verdict: ready — claims: 37 verified / 6 deferred / 0 blocked — spec 630 lines at this verdict
Checked at: grixu/cc-toolkit @ d7f6da87 (remote `main`, fetched 2026-11-17)

| Claim | How it was verified |
|---|---|
| Citations pass 1 added or relied on resolve | `cr-scan/SKILL.md:10`, `cr-prepare/SKILL.md:9,21-31`, `agents/scanner.md:9`, `dev-kit/hooks/decision.ts:1-3` printed at `d7f6da87`; all say what the spec cites them for. |
| D61/K5 hooks-off and D53's cap are host facts | `SPEC.session/research/claude-code.d.ts:4169-4171` ("Rejects when the command … is still running then. Git runs with repo hooks off"), `:10117-10121` (ten minutes at most). |
| Build order within phase 2 and across phases 1–5 (check 8) | Walked C2–C16 against INTEGRATION-1–6 and API-1–3: C3/C4/C5 before C6, C7 before C8, C10 before C8/C9 (section 7 sentence), C9 before C11; R3 released before phase 5 merges. Holds. |
| Landing (check 9) | `scripts/release.sh` executable; `.claude/skills/new-plugin/SKILL.md:27` (`0.0.0`, first minor cuts `v0.1.0`); marketplace `1.17.0`, 11 plugins; `plugin-evals.yml:21,28-29`; seven workflows, none running `claude plugin test`. |
| Finding (non-blocking, closed): API-3 left a watcher's rejection at its own 600 s timeout undefined | d.ts `:4170-4171`; API-3 now reads that rejection as `running`. |
| Finding (non-blocking, closed): `state.json` `pid` had no source; `$.process.spawn` yields only pieces then `{ code, signal }`, and the fallback recorded no pid | d.ts `:4183-4193`; INTEGRATION-5 now writes Codex's pid to `<run>/pid` on both paths, which the sweep (D20) and the fallback's deadline kill read. |
| Finding (non-blocking, open): section 10 places nothing that a committed reader can open | Three rows read "Not placed"; eight point to the closing notes, which sit in the uncommitted session folder. Owner named on every row. |
| Finding (non-blocking, open): a fourth byte-identical copy keeps `decision.ts:1-3` naming three plugins | Unchanged from pass 1; fixing it touches dev-kit, pr-proof and code-review. |

### Validation 2026-11-17 (validate-spec pass 3)

Verdict: ready — claims: 39 verified / 6 deferred / 0 blocked — spec 644 lines at this verdict
Checked at: grixu/cc-toolkit @ d7f6da87 (remote `main`, fetched 2026-11-17)

| Claim | How it was verified |
|---|---|
| Landing (check 9) | `scripts/release.sh` executable; `.claude/skills/new-plugin/SKILL.md:27` (`0.0.0`, first minor cuts `v0.1.0`); marketplace `1.17.0`, 11 plugins; `plugin-evals.yml:21` (2.1.322), `:28-29` (same-repository guard); seven workflows. |
| API-3 and INTEGRATION-5 as pass 2 rewrote them | Read against `SPEC.session/research/claude-code.d.ts:4166-4193`: `exec` keeps `sh`'s pid, so `<run>/pid` is Codex's; the fallback's `\$!` reaches the inner shell as `$!`; a 600 s `timeoutMs` is the documented maximum. |
| Finding (non-blocking, closed): API-3 gave `wait_seconds` 0, the default, a watcher with `timeoutMs` 0, whose meaning the d.ts does not state | d.ts `:4174-4175` names only the 30 s default and the ten-minute maximum; API-3 now reads `state.json` alone at 0. |
| Finding (non-blocking, closed): INTEGRATION-5's relative `pid`, `events.jsonl` and `exit` named no working directory, and `run` and `spawn` default `cwd` to the session's, which would write them into the caller's checkout (against D3) | d.ts `:4174`, `:4190`; INTEGRATION-5 now sets the run directory as `cwd` on both paths. |
| Finding (non-blocking, open): section 10 places nothing a committed reader can open | Unchanged from pass 2; owner named on every row. |
| Finding (non-blocking, open): a fourth byte-identical copy keeps `decision.ts:1-3` naming three plugins | Re-read at `d7f6da87`: "identical in dev-kit/hooks, pr-proof/hooks and code-review/hooks". |

### Validation 2026-11-17 (validate-spec pass 4, post-verdict, on pass 3's edits)

Verdict: ready — claims: 41 verified / 6 deferred / 0 blocked — spec 658 lines at this verdict
Checked at: grixu/cc-toolkit @ d7f6da87 (remote `main`, fetched 2026-11-17)

| Claim | How it was verified |
|---|---|
| INTEGRATION-5's run-directory `cwd` and `exec` pid hold on both paths | `SPEC.session/research/claude-code.d.ts:4174` (`run` init `{ cwd, env, stdin, timeoutMs }`), `:4190` (`spawn` request `{ argv, cwd, env, input }`, `run`'s rules). |
| Landing (check 9) | `scripts/release.sh` executable; `plugin-evals.yml:21` (2.1.322), `:28-29` (same-repository guard); marketplace `1.17.0`, 11 plugins; seven workflows. |
| Finding (non-blocking, closed): pass 3's API-3 sentence read a `wait_seconds` 0 answer from `state.json` alone, but under D29's fallback nothing in the mod watches the child, so only `exit` records the end and a polled run would read `running` forever, against INTEGRATION-5's "state is read back from the files" | INTEGRATION-5 writes `exit` on both paths; API-3 now reads `state.json` and `exit` once at 0. |
| Finding (non-blocking, closed): INTEGRATION-1's `invocation` returns a `cwd` that INTEGRATION-2 never set, while INTEGRATION-5 now fixes the process `cwd` to the run directory | INTEGRATION-2 now returns the run directory as `cwd`; Codex's working directory stays `-C`. |
| Finding (non-blocking, open): section 10 places nothing a committed reader can open | Unchanged from pass 3. |
| Finding (non-blocking, open): a fourth byte-identical copy keeps `decision.ts:1-3` naming three plugins | Unchanged from pass 3. |

### Validation 2026-11-17 (validate-spec pass 5, on P1's edits: D63–D65)

Verdict: not ready — claims: 50 verified / 6 deferred / 0 blocked, 1 open (exchanged token in the uploaded run directories, handed to the user) — spec 698 lines at this verdict
Checked at: grixu/cc-toolkit @ d7f6da87 (the base of `feat/collegium` and of every citation); `origin/main` is at 28b8dde9, whose one commit touches no cited file but `plugins/dev-kit/hooks/register.ts` (`:50` is now `:64`, `:336` is now `:454`)

| Claim | How it was verified |
|---|---|
| WIF exchange contract behind D63 and INTEGRATION-2 step 2 | developers.openai.com/api/reference/workload-identity-federation re-read 2026-11-17: `POST https://auth.openai.com/oauth/token`, `Content-Type: application/json`, the five body fields, response `access_token`, `token_type: "Bearer"`, no refresh token, never outlives the subject JWT. |
| The three Actions variables exist and no `OPENAI_API_KEY` secret does | `gh variable list -R grixu/cc-toolkit` and `gh secret list -R grixu/cc-toolkit`, run 2026-11-17. |
| `.github/workflows/plugin-evals.yml:13-14` grants only `contents: read`, `:57` opens the `eval` job, `:143-146` guards only `CLAUDE_CODE_OAUTH_TOKEN` | Printed at `d7f6da87`; the file is unchanged on `origin/main`. |
| D64: the `EVAL_` names reach the run unchanged, so the mod reads the prefixed names | `SPEC.session/research/plugin-evals-doc.md:496,546` (the run inherits `EVAL_*`; "export it as an EVAL_* variable"). |
| `$.http.fetch` takes `method`, `headers` and a string `body`, and its time is outside the 10 s budget; a computed URL still loads | `SPEC.session/research/claude-code.d.ts:4114-4156,6221-6235` and the `hosts.unread` rule at `:9385-9400`; budget quote in `evidence/12-appendix.md`. |
| `codex login --with-api-key` reads the key from stdin | `codex login --help` on 0.169.0. Whether it accepts a WIF token stays G3. |
| D65's model and effort pass INTEGRATION-3's catalogue check in CI, where the catalogue is read before any run's login | Probe: `CODEX_HOME=<empty dir> codex debug models` on 0.169.0 exits 0 with its bundled list, which holds `gpt-6-luna` with `low`. |
| D65's catalogue descriptions | `jq` over `SPEC.session/research/codex-models.json`: "Fast and affordable model for easier tasks."; `low`: "Fast responses with lighter reasoning". |
| Finding (non-blocking, closed): INTEGRATION-1 named no adapter method that runs the CI path, while `invocation` is synchronous without `$` and `runs.ts` may name no CLI flag | INTEGRATION-1 gains `prepare($, runId)`, whose env joins every harness call of the run; INTEGRATION-2's CI path runs in it. |
| Finding (non-blocking, closed): `<os tmpdir>` has no source in a hooks module | `claude-code.d.ts:23-24` ("no DOM, no Node"); INTEGRATION-2 now reads it as `$.env.get('TMPDIR')`, `/tmp` when unset. |
| Finding (non-blocking, open, repair choice): `codex login --with-api-key` stores the exchanged token in `CODEX_HOME`, which the mod puts under its temp directory; `--keep-temp` seals each run's home and tmp, the step copies them into `$out/runs` and uploads them to R2 (`plugin-evals.yml:130-140,150-164`), and the guard checks only the OAuth token, so a token valid for up to 5 minutes may be stored in the bucket. D63 keeps tokens out of logs but accepts no stored token | Handed to the user. |
| Finding (non-blocking, open): section 10 places nothing a committed reader can open | Unchanged from pass 4. |
| Finding (non-blocking, open): a fourth byte-identical copy keeps `decision.ts:1-3` naming three plugins | Unchanged from pass 4. |
| Stored-token repair: the user chose option (c), accept the risk (2026-11-17) | Risk K8 added to section 3; its bound is the 300 s JWT lifetime already recorded for K7 (`evidence/12-appendix.md`, OpenAI workload identity federation). The finding stays non-blocking in this record, closed by that repair. |

Verdict: ready — claims: 51 verified / 6 deferred / 0 blocked — spec 702 lines at this verdict

### Validation 2026-11-18 (validate-spec pass 6, on P2/P3 and D72–D74)

Verdict: not ready — claims: 61 verified / 3 deferred / 0 blocked, 2 open (headless `/collegium:run`, notice to subagent callers; both handed to the user) — spec 738 lines at this verdict
Checked at: grixu/cc-toolkit @ d25540bb (`feat/collegium`, fetched 2026-11-18; code-review and fd3 files unchanged since `d7f6da87`); branch `feat/code-review-codex-review` @ c8e73867

| Claim | How it was verified |
|---|---|
| G1, G2, G4 answers behind D66, D67, D68 | `evidence/spikes.md` verdicts and timelines read against D66–D68, INTEGRATION-5 and CONFIG-2; closing notes P2. |
| New citations resolve | `plugins/collegium/hooks/codex.ts:163-166`, `decision.ts:11`, `harness.ts:23-32`, `prompt.ts:98-103` at `d25540bb`; `plugin-evals.yml:21` (2.1.327); d.ts `:23-24`, `:3440-3441`, `:4234`; `codex-review.md:27-29` and `merge-contract.md:274,374-375` at `c8e73867`. |
| Decision client byte-identical in four plugins | `cmp` of `hooks/decision.ts` and `hooks/providers/*.ts`, dev-kit against pr-proof, code-review and collegium: all equal. |
| Landing (check 9) | `scripts/release.sh` executable; collegium `plugin.json` at `0.0.0` with CONFIG-1's option; marketplace 1.19.0, 12 plugins; `plugin-evals.yml:13-14,28-29,57` unchanged. |
| Finding (non-blocking, closed): section 1 credited D66–D67 to `implement-answers.md` Q8, which records only G4 | `implement-answers.md` Q4 and Q8; section 1 now names Q8 for D68 alone. |
| Finding (non-blocking, closed): the marketplace row named no commit and is stale at `d25540bb` | `jq` over `.claude-plugin/marketplace.json`; row now names both commits. |
| Finding (blocking, open, repair choice): UI-1 ends its turn after launch (D58), but a headless session exits when its turn ends, killing the spawn and refusing the notice; TEST-3 (every eval run is `claude -p`) and any `claude -p` use of `/collegium:run` in TEST-2 cannot get an envelope | Probe on 2.1.327, 2026-11-18: `claude -p` with the host-probe plugin exited 10 s after start, the un-awaited spawn ended `{"code":null,"signal":"SIGTERM"}` after 1 of 90 ticks, and `$.prompt.submit` rejected "no session is bound in this process"; `SPEC.session/research/plugin-evals-doc.md:40,494`. |
| Finding (blocking, open, repair choice): D17/D67 send every run's notice to the main thread, which then calls `collegium_result`, and D20 deletes the run on that first delivery, so a scanner or workflow agent waiting on its own run (D52, D53) gets "unknown id" | `tool.call` carries `agentId`, absent on the main loop (`SPEC.session/research/claude-code.d.ts:395-404`); API-3 and INTEGRATION-5 retention. |
| Finding (non-blocking, open): section 10 places nothing a committed reader can open | Unchanged from pass 5. |
| Finding (non-blocking, open): `decision.ts:1-3` names three plugins while four copies exist | Re-read in `plugins/collegium/hooks/decision.ts:1-3` at `d25540bb`. |
| Headless repair: the user chose option (a), a `--wait` flag (2026-11-18) | D75 added; D58's rationale, UI-1, INTEGRATION-5 (rejected submit dropped), TEST-2 and TEST-3 edited. The finding stays blocking in this record, closed by that repair. |
| Notice repair: the user chose option (a), main-loop runs only (2026-11-18) | D76 added; D17's rationale, INTEGRATION-5 notice bullet and TEST-1 edited. The finding stays blocking in this record, closed by that repair. |

Verdict: ready — claims: 63 verified / 3 deferred / 0 blocked — spec 744 lines at this verdict

### Validation 2026-11-18 (validate-spec pass 7, on pass 6's D75–D76 edits)

Verdict: ready — claims: 66 verified / 3 deferred / 0 blocked — spec 763 lines at this verdict
Checked at: grixu/cc-toolkit @ d25540bb (`feat/collegium`, fetched 2026-11-18; `origin/main` @ dd387afe changes no cited code-review, fd3 or dev-kit source line, and its `plugin-evals.yml:21` still pins 2.1.322 because `1954c54b` is on the branch only); branch `feat/code-review-codex-review` @ c8e73867

| Claim | How it was verified |
|---|---|
| D76: a workflow's agents get no notice, so only the main loop is notified | `SPEC.session/research/claude-code.d.ts:395-404`: `agentId` is absent on the main loop only; "A workflow's agents and the engine's own forks … carry ids no list names". |
| D67/D76 drop and reject rules agree with INTEGRATION-5 and TEST-1 | Read together: a `{ drop }` answer goes to the pending set, a rejected submit is dropped, an `agentId` run is never notified; TEST-1 names each case. |
| TEST-3 cases need a cap above the eval default | `SPEC.session/research/plugin-evals-doc.md:543` (`timeout_seconds` default `300`, up to 3600), `:741`; repo precedent `plugins/anti-slop/evals/clean-text-untouched/prompt.md:7` (`600`). |
| Section 12 marketplace row | `jq` over `.claude-plugin/marketplace.json`: `1.17.0`, 11 plugins at `d7f6da87`; `1.19.0`, 12 plugins, collegium `0.0.0` at `d25540bb`. |
| As-built citations behind D69, D72–D74 | `plugins/collegium/hooks/codex.ts:163-166`, `decision.ts:11`, `harness.ts:23-32`, `prompt.ts:98-103` printed at `d25540bb`; each says what it is cited for. |
| Landing (check 9) | `scripts/release.sh` executable; `plugin-evals.yml:13-14` (`contents: read`), `:21` (2.1.327), `:28-29` (same-repository guard), `:57` (`eval:`) at `d25540bb`. |
| Finding (non-blocking, closed): TEST-3 named no `timeout_seconds`, so every case ran under the 300 s default, no longer than K7's token, with Claude's turns, detection, the WIF exchange and a `--wait` `collegium_result` (D75) counted inside it | TEST-3 now sets `timeout_seconds: 600` per case. |
| Finding (non-blocking, open): section 8's INTEGRATION-5 row observes a `timeout_minutes: 1` run in TEST-2, but TEST-2 now runs only through `/collegium:run --wait` (D75), whose UI-1 flags carry no timeout, and TEST-2 lists three runs, none of them a timeout run | UI-1 flag list, TEST-2, section 8 row; API-1 `timeout_minutes`; D19 "caller may override". Work proceeds: the C13 author adds a `--timeout <minutes>` flag to UI-1 or has the script call `collegium_run` directly. |
| Finding (non-blocking, open): a main-loop run whose result the caller already waited for (`--wait`, or D17's wait or poll) is still notified (D67), and the notice's `collegium_result` then answers "unknown id", because D20 deleted the run on the first delivery | D17, D20, D67, UI-1 "On the notice it calls `collegium_result`"; d.ts `:3440-3441` (a submit runs once the session is idle). Costs one stray turn with an error, no lost result; not in the earlier record. |
| Finding (non-blocking, open): section 10 places nothing a committed reader can open | Unchanged from pass 6. |
| Finding (non-blocking, open): `decision.ts:1-3` names three plugins while four copies exist | Re-read in `plugins/collegium/hooks/decision.ts:1-3` at `d25540bb`. |

### Validation 2026-11-18 (validate-spec pass 8, on pass 7's TEST-3 edit)

Verdict: ready — claims: 66 verified / 3 deferred / 0 blocked — spec 773 lines at this verdict
Checked at: grixu/cc-toolkit @ d25540bb (`feat/collegium`, fetched 2026-11-18; local HEAD equals the remote branch)

| Claim | How it was verified |
|---|---|
| TEST-3 `timeout_seconds: 600` per case, and its citations | `SPEC.session/research/plugin-evals-doc.md:543` reads "`timeout_seconds` \| `300` \| Wall-clock cap per run, up to 3600"; `:741` "The defaults are 10 turns and 300 seconds. Raise `max_turns` and `timeout_seconds` in the case"; `plugins/anti-slop/evals/clean-text-untouched/prompt.md:7` is `timeout_seconds: 600`; K7 (section 3) states the ~5-minute token. 600 is within the 3600 ceiling and is valid in either file TEST-3 names (`prompt.md` frontmatter or `case.yaml` under `execution:`, `plugin-evals-doc.md`, case.yaml fields). |
| Carried non-blocking findings (TEST-2/UI-1 timeout route, stray notice after `--wait`, section 10 placement, `decision.ts:1-3`) | Unchanged by the TEST-3 edit; still open, still non-blocking. |

### Validation 2026-11-18 (validate-spec pass 9, on P4's edits: D77–D78, C16 dropped, C17 added)

Verdict: ready — claims: 75 verified / 2 deferred / 0 blocked — spec 798 lines at this verdict
Checked at: grixu/cc-toolkit @ 5a475c27 (`feat/collegium`, fetched 2026-11-18, local HEAD equals the remote branch; `origin/main` @ 2ee20d08); no cited code-review, fd3, dev-kit or `plugin-evals.yml` line changed since `d25540bb`

| Claim | How it was verified |
|---|---|
| G3 negative behind D77, K4 and CICD-1 | `evidence/spikes.md`, section G3, added by `aabcaafd` (an ancestor of `5a475c27`); `implement-answers.md` Q9; closing notes P4. G3 moves from deferred to verified. |
| CICD-2 needs no job (D77) | `.github/workflows/lint.yml:3-6` (every `pull_request`), `:39` (2.1.327), `:52-58` ("Run mod tests" loop over `tests/` plus `hooks/hooks.json`) at `5a475c27`. |
| D78's trigger and C17's removal set | `plugins/collegium/hooks/codex.ts:5,60-121` and `tests/codex.test.ts:1-18,140-234` printed at `5a475c27`: five `EVAL_*` reads at `:80-85`, four CI tests at `:150-234`, kept test at `:140-148`; `search_code` for `EVAL_\|oauth/token\|http\.fetch` under `plugins/collegium` hits only `codex.ts`, `decision.ts:54` and tests. |
| Landing unit 1 size | `git diff --shortstat 2ee20d08...5a475c27 -- plugins/collegium .claude-plugin README.md .github` → 32 files, 4,371 insertions, 2 deletions. |
| Landing (check 9) | `scripts/release.sh` header at `5a475c27`: runs only on a HEAD equal to `origin/main` and pushes it atomically, so "PR merged, then `release.sh`" (sections 5, 7) holds; `lint.yml` runs on every PR. |
| Build order (check 8) | C17 (phase 3) changes INTEGRATION-2 and TEST-1, built by C5 and C12 in phase 2; C15 and C16 land nothing; phases 1–3 stay one PR (D62). Holds. |
| Finding (non-blocking, closed): D73 cited `harness.ts:23-32`, but at `5a475c27` `RunSpec` sits at `:27-37` with a `schemaPath` field neither D73 nor INTEGRATION-1 listed | `git log -S schemaPath` → `809aba73` (code-review refactor: pass the path INTEGRATION-4 wrote instead of rebuilding it); D73 and INTEGRATION-1 now list it, citation corrected. The section 12 row pinned at `d25540bb` still resolves. |
| Finding (non-blocking, closed): D74 cited `prompt.ts:98-103`, now `:96-101` | Printed at `d25540bb` and `5a475c27`; citation corrected. The section 12 row pinned at `d25540bb` still resolves. |
| Finding (non-blocking, closed): C17's file cell omitted `codex.ts:1`, whose `withoutTrailingSlash` import only `prepare` (`:87`) uses | `search_code` for `withoutTrailingSlash` under `plugins/collegium`; cell now names `:1`. |
| Finding (non-blocking, closed): pass 7's TEST-2 timeout route | As built, `plugins/collegium/scripts/live-check.sh:112-125` runs a fourth, timeout run that calls the tools directly with `timeout_minutes 1` and checks the process is gone; TEST-2 and the UI-1 row in section 8 now say so. |
| Finding (non-blocking, closed): pass 7's stray notice after `--wait` | As built, `plugins/collegium/skills/run/SKILL.md:57-59` ignores a notice for an id whose envelope it showed and never calls `collegium_result` for it; UI-1 now says so. The cost left is one idle turn, no error. |
| Finding (non-blocking, open): section 10 places nothing a committed reader can open | Four rows now read "Not placed" (P4 added the WIF-deletion row); owner named on every row. |
| Finding (non-blocking, open): `decision.ts:1-3` names three plugins while four copies exist | Re-read in `plugins/collegium/hooks/decision.ts:1-3` at `5a475c27`. |

### Validation 2026-11-18 (validate-spec pass 10, on pass 9's edits: D73, D74, C17, TEST-2, UI-1)

Verdict: ready — claims: 75 verified / 2 deferred / 0 blocked — spec 813 lines at this verdict
Checked at: grixu/cc-toolkit @ 5a475c27 (`feat/collegium`, fetched 2026-11-18, local HEAD equals the remote branch; `origin/main` @ 2ee20d08)

| Claim | How it was verified |
|---|---|
| Pass 9's citations resolve | At `5a475c27`: `plugins/collegium/hooks/harness.ts:27-37` is `interface RunSpec` with `schemaPath: string` at `:33` (`git log -S schemaPath` → `809aba73`); `hooks/prompt.ts:96-101` is the `pluginRoot` comment and function; `hooks/codex.ts:1` imports `withoutTrailingSlash`, used only at `:87` inside `prepare`; `scripts/live-check.sh:112-125` is the "no timeout flag" comment through `run_timeout`'s closing brace; `skills/run/SKILL.md:57-59` is the ignore-a-delivered-notice rule. |
| D73 and INTEGRATION-1 agree with INTEGRATION-2 | `schemaPath` is the `<run>/schema.json` INTEGRATION-2 passes as `--output-schema`; field list and order match the as-built interface. |
| TEST-2 and section 8 UI-1 row | `live-check.sh:79,86,108` are the three `/collegium:run --wait` runs (read-only, `branch`, skill); `:117` is the direct `timeout_minutes 1` run; the INTEGRATION-5 row's TEST-2 timeout run now exists. |
| Landing (check 9) | `scripts/release.sh` executable; `.github/workflows/lint.yml:39` (2.1.327), `:52-58` ("Run mod tests" loop) at `5a475c27`. |
| Finding (non-blocking, open): pass 9 closed pass 7's stray-notice finding through UI-1's ignore rule alone, but that finding also covered a main-loop caller that calls `collegium_run` and waits or polls itself (D17): its notice still says "Call collegium_result", and the call answers `unknown run id …: no such run, or its result was already delivered` | `plugins/collegium/hooks/runs.ts:295` (notice text), `:372-378` (delivery clears only a pending notice, not one already accepted); `hooks/register.ts:240` (error text). Costs one stray turn whose error says why; no result is lost. Reopened under check 1. |
| Finding (non-blocking, open): section 10 places nothing a committed reader can open | Four rows read "Not placed"; owner named on every row. |
| Finding (non-blocking, open): `decision.ts:1-3` names three plugins while four copies exist | Re-read in `plugins/collegium/hooks/decision.ts:1-3` at `5a475c27`. |
