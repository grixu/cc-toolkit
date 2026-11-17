# collegium: run a piece of work on another harness and model

Adds a `collegium` plugin that runs one task or skill on OpenAI Codex with a chosen model and effort, asynchronously, and wires it into code-review and fd3 as an optional external Codex review.

| | |
|---|---|
| Epic / ticket | None; see section 11 |
| Status | Draft, written 2026-11-17; D52–D62 ratified 2026-11-17; validate-spec pass 4 (post-verdict), 2026-11-17: ready; post-verdict decision P1 (D63–D65, OpenAI workload identity federation) applied 2026-11-17; validate-spec pass 5, 2026-11-17: ready |
| Date | 2026-11-17 |
| Repository | `grixu/cc-toolkit` at `d7f6da87`, branch `feat/collegium` |

Companion documents: [evidence/12-appendix.md](evidence/12-appendix.md) (quotes the evidence rows rest on). The deciding session's notes and research sit in the uncommitted session folder beside this file; evidence rows name their report there as `SPEC.session/research/<file>` beside the source a reader on another machine can open.

## 1. Header and precedence

No earlier spec, plan or ADR exists for collegium: `.ai/specs/` held only `prepare-proof/` and `.ai/plans/` no collegium plan at `d7f6da87`. Two written rules in code-review are amended, and this spec wins where they disagree:

1. `plugins/code-review/docs/adr/0002-active-lens-set-and-standards.md` and `plugins/code-review/commands/start-cr.md:6` ("Lenses are gated by the input, never by the user"): the Codex review is gated by a user setting (D38) and by tool presence (D35). It is not a lens of the lens set: it is an external review that rides the lens-file channel (D41, D55), so the input-gated rule keeps holding for every lens.
2. `plugins/code-review/commands/start-cr.md:274-286` (fail closed on any active lens that did not deliver, with a proceed-or-abort menu): the Codex review never enters that menu; a failed or timed-out run degrades to `skipped: codex` (D37, D55).

Nothing else in code-review's or fd3's written rules is reversed. The question-ledger proposal in Q18 option a (branch-only write mode) was widened by the user's Q20 answer into three modes (D24); it is not a reversal of a written rule.

Decision numbering: `D1`–`D38` are the closing notes' ratified `R1`–`R38`; `D39`–`D51` are the notes' assistant-taken `D1`–`D13`; `D52`–`D61` were taken while writing this spec and ratified by the user on 2026-11-17; `D62` is the user's answer to the landing-unit size question the same day; `D63` is the closing notes' post-verdict decision `P1`, and `D64`–`D65` were taken while applying it and ratified by the user the same day.

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
| D16 | **The Codex process lives as long as the Claude Code session that started it (`$.process.spawn`); closing Claude Code kills it.** | Q15.1 b. Cost accepted: a closed session loses its runs; the spawn lifetime is the open fact behind K3 and D29. |
| D17 | **Completion: the caller may wait or poll, and the mod also injects "run X finished" into the idle session.** | Q15.2 a. Delivery mechanics are D43 and gap G2. |
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
| D29 | **Spike: a mod `$.process.spawn` lasting 65 minutes must deliver its stream and exit code; if it fails, Collegium falls back to a detached process (`nohup … &`; macOS ships no `setsid`) with the run directory as the source of truth.** | Q23 a; the spike started during the session (K3, gap G1). |
| D30 | **No concurrency limit; quota errors from Codex surface as `failed` with the reason.** | Q24 a. |
| D31 | **Tests: mod unit tests with a stubbed `$` (`claude plugin test`), a manual live script against real Codex, and a `claude plugin eval` suite for `/collegium:run`.** | Q25 b. `claude plugin test` runs `*.test.ts` against `claude-code/testing` (`SPEC.session/research/ci-evals.md`, section 2). |
| D32 | **One integration in v1: code-review gets an additional Codex review through Collegium, with no declared plugin dependency.** | Q26 b and Q27 a. A missing declared dependency silently unloads the dependent plugin (user memory `cc-plugin-dependencies.md`, quoted in `SPEC.session/research/code-review-integration.md`, section 4). |
| D33 | **The eval also runs in CI. The first implementation task is a CI spike; if it fails (G3), the eval stays local-only and CI runs a new `claude plugin test` job instead. CI authenticates Codex as D63 says.** | Q28 b and Q34 a. Only `EVAL_*` variables pass into an eval run, and whether a mod sees them is undocumented (`SPEC.session/research/ci-evals.md`, section 4); the original API key secret, `EVAL_OPENAI_API_KEY` and one login per session fell to D63. |
| D34 | **The Codex review runs in interactive `/start-cr` and in the headless skills fd3 uses; it is configurable, and when not configured fd3 `implement-tasks` asks in step 2 whether to review and whether with Codex.** | Q29 b. Scope spans three plugins: collegium, code-review, fd3. |
| D35 | **The Codex review is on whenever the Collegium tool is available and Codex is enabled in Collegium, governed by D38's setting.** | Q30 b. |
| D36 | **Codex gets code-review's family and rule table and the schema `{family, rule, severity, path, lines, loss, fix}`; the result is rendered into `<ctx>/codex.md` in scanner-contract format and added to `lenses.active`; items fitting no rule go to `CANDIDATES`.** | Q31 a. The merge reads whatever `lenses.active` lists, with no lens-name whitelist (`plugins/code-review/skills/cr-merge/SKILL.md:28-34`). |
| D37 | **The Codex run starts together with the Claude scanners; the merge waits for it (60-minute limit); failure or timeout is `skipped: codex` in the Tally, never the fail-closed menu.** | Q32 a. |
| D38 | **code-review gets a `userConfig` option `collegium_run` with values `always`, `never`, `ask`.** | Q33 a. |
| D39 | **The write-mode worktree lives inside the run directory: `<parent>/<repo>.collegium/<run-id>/worktree`.** | assistant-taken (notes D1), following D18; covered by the user's closing confirmation. |
| D40 | **A caller-supplied `result` schema is checked locally against strict-mode rules (object root, `additionalProperties: false`, every property required, no `allOf`/`not`/`if`) before launch.** | assistant-taken (notes D2), following D21. Codex validates the schema only as JSON, so a bad one fails at the API (`SPEC.session/research/codex-skills.md`, question 3). |
| D41 | **A Codex finding agreeing with a Claude lens counts as independent convergence; Codex is not counted among code-review's lenses, hard-coded lens counts stay, and the docs call it an "external review".** | assistant-taken (notes D3), following D36. Convergence of independent readers is the strongest signal the merge has (`plugins/code-review/references/merge-contract.md:55-62`). |
| D42 | **With `--pr`, Codex runs with that pull request's worktree as its working directory.** | assistant-taken (notes D4), following D36; `scope.json` `checkout` is the PR worktree under `--pr` (`plugins/code-review/commands/start-cr.md:208-209`). |
| D43 | **The completion notice is sent from the main-thread `turn.complete` event (`!e.agentId`), because `$.prompt.submit` is refused inside a `tool.call` hook.** | assistant-taken (notes D5), following D17; the refusal is a host check seen live (`SPEC.session/research/mod-tools-subagents.md`, Verdict). Whether an idle session also gets it at once is gap G2. |
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
| D55 | **A Codex run that fails, times out, is skipped or finds the tool absent still writes `codex.md`, with the header `Lens: codex · skipped: <reason>`; `cr-merge` and the `/start-cr` merge read that as `skipped: codex — <reason>` in the Tally and never as an undelivered lens. Codex stays outside `Lenses: L of A`; a delivered run adds `External review: codex` to the Tally.** | assistant-taken while writing, ratified by the user 2026-11-17 (writing report question batch); following D37 and D41. `cr-merge` otherwise returns `incomplete` for a missing or headerless lens file (`plugins/code-review/skills/cr-merge/SKILL.md:28-34`), which would hold an fd3 branch on an optional reader. |
| D56 | **The decision backend choice (`auto`, `typesafe`, `gemini`) lives in the JSON config as `decision.backend`; API keys come from the environment only (`TYPESAFE_API_KEY`, `GEMINI_DECISIONS_API_KEY`, then `GEMINI_API_KEY`); `auto` with both keys uses `typesafe` instead of asking.** | assistant-taken while writing, ratified by the user 2026-11-17 (writing report question batch); following D6 and D25. D25 keeps key options out of `userConfig`, the copied `providerKeys` already falls back to these variables (`plugins/dev-kit/hooks/providers/index.ts:33-39`), and an unattended caller cannot answer "Backend choice needed" (`index.ts:60-67`). |
| D57 | **A run id is `<UTC yyyymmddThhmmss>-<6 hex>`, and the run directory's `state.json` is the source of truth for state; the mod's in-memory map only caches it.** | assistant-taken while writing, ratified by the user 2026-11-17 (writing report question batch); following D18 and D29. The detached fallback of D29 has no mod memory, so the file must already carry the state. |
| D58 | **`/collegium:run` launches the run, prints the run id and ends its turn; on the completion notice it calls `collegium_result` and shows the envelope.** | assistant-taken while writing, ratified by the user 2026-11-17 (writing report question batch); following D15 and D17. Mirrors `/start-cr`'s "waiting is ending your turn" (`plugins/code-review/commands/start-cr.md:265-273`). |
| D59 | **A tier maps to exactly one `provider/model`; with a mapping present the decision picks a tier, otherwise a model from the palette. When the Haiku fallback answers with a model or effort outside the allowed set, Collegium passes neither `-m` nor the effort flag and Codex uses its own configured defaults.** | assistant-taken while writing, ratified by the user 2026-11-17 (writing report question batch); following D5, D6 and D7. Codex's config default is `gpt-6.1-sol` at `high` on this machine (`SPEC.session/research/live-harnesses.md`, Models and effort). |
| D60 | **"Field by field" (D27) means: tier keys merge one by one (project wins per tier), an exclude list in the project replaces the user's list for that palette, `harnesses.order` in the project replaces the user's, and `disabled` names harnesses the project switches off.** | assistant-taken while writing, ratified by the user 2026-11-17 (writing report question batch); following D27. |
| D61 | **Commits in `branch` and `merge` modes use the user's git configuration as it is, signing included, but repository hooks do not run on them: a mod's git runs with repo hooks off (host behaviour, K5). A commit that fails ends the run `failed` with git's message and keeps the worktree. `merge` runs in the caller's checkout, and a merge git refuses because of local changes is status `conflict`.** | assistant-taken while writing, ratified by the user 2026-11-17 (writing report question batch); following D24 and D50. Collegium never bypasses signing itself. Hooks-off was accepted by the user on 2026-11-17 (validate-spec pass 1, question 1, option a), because `$.process.run` git "runs with repo hooks off" (`SPEC.session/research/mod-api.md`, section 1). |
| D62 | **Landing unit 1 (phases 1–3) stays one pull request; it is not split.** | The user's answer, 2026-11-17, to the writing report's subdivision question, which proposed a read-only PR 1a and a write-modes, config, eval and CI PR 1b. Cost accepted: one review of about 35 files and 3,500–4,000 changed lines (estimate in section 7). |
| D63 | **CI uses OpenAI workload identity federation, not a stored key: no `OPENAI_API_KEY` secret; the eval job gets `id-token: write`; right before every Codex start the mod fetches a fresh GitHub OIDC JWT, exchanges it at `POST https://auth.openai.com/oauth/token`, and logs that run's temporary `CODEX_HOME` in with the `access_token` through `codex login --with-api-key`. Tokens and JWTs never reach logs, and the workflow's token guard also covers the OIDC request token.** | P1 (closing notes, post-verdict), option (a) of (a) re-exchange per Codex start, (b) keep the key, (c) exchange once and keep the eval under 5 minutes; ratified by the user 2026-11-17. It supersedes D33's key secret because the user chose WIF; per start, because an exchanged token never outlives GitHub's 300 s JWT and has no refresh (`SPEC.session/research/openai-wif.md`; `evidence/12-appendix.md`). |
| D64 | **The eval step passes `EVAL_ACTIONS_ID_TOKEN_REQUEST_URL`, `EVAL_ACTIONS_ID_TOKEN_REQUEST_TOKEN`, `EVAL_OPENAI_WIF_AUDIENCE`, `EVAL_OPENAI_IDENTITY_PROVIDER_ID` and `EVAL_OPENAI_SERVICE_ACCOUNT_ID`; the mod takes the CI path when the request token is non-empty, and each run's `CODEX_HOME` is `<os tmpdir>/collegium-codex-home/<run-id>`.** | assistant-taken while applying P1, ratified by the user 2026-11-17 (P1 writing report, question 1); P1 fixes the five values but not their names or the home's path. Names are the source names with the `EVAL_` prefix an eval run requires (`SPEC.session/research/ci-evals.md`, section 4); a home per run keeps concurrent runs (D30) from overwriting each other's login. |
| D65 | **Every TEST-3 case pins `openai/gpt-6-luna` at effort `low`.** | assistant-taken while applying P1, ratified by the user 2026-11-17 (P1 writing report, question 2); P1 requires a fast model at low effort so each `codex exec` ends inside the ~5-minute token and names `gpt-6-luna` or `gpt-6.1-sol` + `low` as examples. The catalogue describes `gpt-6-luna` as "Fast and affordable model for easier tasks" and `low` as "Fast responses with lighter reasoning" (`SPEC.session/research/codex-models.json`); cost accepted: the eval does not exercise the model the user runs by default. |

### Risks accepted

| # | Risk | Cost if it lands | Mitigation |
|---|---|---|---|
| K1 | `codex debug models` is a diagnostic command; its JSON may change without notice. | Detection or effort lists break after a Codex update. | INTEGRATION-2 parses only `slug`, `visibility`, `supported_reasoning_levels[].effort`, `default_reasoning_level`; a parse failure fails the run with the Codex version named. |
| K2 | Code and task content go to OpenAI. | Data leaves the machine for every run. | D26: disabled until the user enables Codex; enabling is the consent. |
| K3 | The 65-minute spawn spike had not finished at confirmation. | A run over the spawn limit loses its stream or exit code. | Resolved after confirmation: the spike passed (I25), so D16 stands. What it left untested, an interactive session and a spawn outliving its handler, is gap G1, with D29's fallback as the rule. |
| K4 | Whether a mod inside `claude plugin eval` sees `EVAL_*` variables is undocumented. | The CI eval cannot log Codex in. | D33 covers both outcomes (gap G3). |
| K5 | Collegium's commits and merges run with repo hooks off (D61). | Pre-commit and commit-msg checks are skipped on `collegium/*` commits, and post-merge hooks are skipped on the caller's merge. | The hooks still run on the caller's next own commit or push, and CI runs the same checks. |
| K6 | The GitHub OIDC request token is visible to the eval run's environment for the job's duration (D63, accepted with P1). | Anything in the run can mint OIDC JWTs for this job and exchange them for OpenAI tokens. | The JWTs serve only this repository's job, the OpenAI mapping limits them to the plugin-evals workflow (assertions as suggested, not read back), fork pull requests get no `id-token`, and the token guard drops run directories that captured the request token. |
| K7 | An exchanged OpenAI token lives about 5 minutes (D63). | A `codex exec` running longer loses API access mid-run and the case fails. | D65 pins a fast model at low effort; the eval cases are small tasks on a fixture repository (TEST-3). |
| K8 | `codex login --with-api-key` writes the exchanged token into the run's `CODEX_HOME`, which the eval step may keep with the run's home and tmp (`--keep-temp`) and upload to the private R2 bucket; the workflow's guard looks only for the Claude Code OAuth token (accepted by the user, validate-spec pass 5). | Anyone who reads the bucket before the token expires can make OpenAI API calls as the service account. | The token never outlives its GitHub OIDC JWT, about 300 s (K7), so it has usually expired by the time the upload lands; the bucket is private. No mod-side deletion and no upload guard. |

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
  evals/<case>/                   TEST-3
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
- The mod reads the user file's directory from `await $.process.hookEnv()` (`CLAUDE_PLUGIN_DATA`); this call is unprobed (gap G4).
- An unreadable or invalid file is an error naming the file and the field; Collegium never runs on a half-read config.

### INTEGRATION-1: harness adapter contract

```ts
interface HarnessAdapter {
  id: string                                   // 'codex'
  detect($): Promise<{ installed: boolean; version?: string; path?: string }>
  catalogue($): Promise<Palette[]>             // cached in $.store by the caller (D13)
  prepare($, runId: string): Promise<Record<string, string>>  // env merged into every harness call of the run; Codex: the CI path, else {}
  loginStatus($, env): Promise<{ loggedIn: boolean; fix: string }>   // fix: '! codex login'
  invocation(run: RunSpec): { argv: string[]; env: Record<string, string>; cwd: string }
  parseEvent(line: string): RunEvent | null    // progress for collegium_status
  finalMessage(runDir: string): string | null  // the envelope JSON text
}
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
- CI path (D63, D64), run by `prepare`: when `$.env.get('EVAL_ACTIONS_ID_TOKEN_REQUEST_TOKEN')` is non-empty (each D64 name read by a literal `$.env.get`), every Codex call of a run gets `CODEX_HOME=<os tmpdir>/collegium-codex-home/<run-id>`, where `<os tmpdir>` is `$.env.get('TMPDIR')`, or `/tmp` when unset (a hooks module has no Node), and right before the run's Codex start, ahead of the D10 login check, the mod:
  1. `$.http.fetch(GET <EVAL_ACTIONS_ID_TOKEN_REQUEST_URL>&audience=<url-encoded EVAL_OPENAI_WIF_AUDIENCE>, Authorization: bearer <request token>)` → JWT from the JSON `value`;
  2. `$.http.fetch(POST https://auth.openai.com/oauth/token, JSON { grant_type: "urn:ietf:params:oauth:grant-type:token-exchange", subject_token_type: "urn:ietf:params:oauth:token-type:jwt", subject_token, identity_provider_id, service_account_id })` → `access_token`;
  3. `$.process.run(['codex', 'login', '--with-api-key'], { env: { CODEX_HOME }, stdin: access_token })`.
  A failed step ends the run `failed` naming the step and its HTTP status or exit code, never a token, JWT or response body.
- `parseEvent`: JSONL from `--json`; `item.completed` with `item.type == "agent_message"` → message, command items → command, `item.type == "error"` → warning (never a failure), `turn.failed` → failed (D46).
- `finalMessage`: the `-o` file.

### INTEGRATION-3: model and effort choice

`choose.ts`, inputs: the effective palette (catalogue minus `exclude` minus hidden, plus mapped models), the tier map, the caller's `model` and `effort`, the task text.

1. Both given → validate both against the catalogue; an unknown model or an effort the model lacks is an error before launch.
2. Model missing → with a tier map: a `choice` question over `high`/`medium`/`low` (the mapped ones only); without: a `choice` over the palette's model ids. Then effort, unless given.
3. Effort missing → a `choice` over the chosen model's `efforts` (D7, D48).
4. Backend: the copied client with `chooseBackends({ decision_backend }, undefined, keys, 'collegium')`; on `'choose'` take `typesafe` (D56). No key → one `$.model.complete({ model: 'haiku', ... })` asking for `{model, effort}` as JSON; an answer outside the allowed set leaves both to Codex's defaults (D59).

The status and result report the backend that chose and whether each value came from the caller or the decision.

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

A caller `result_schema` replaces `result`'s schema after the D40 check; a failing check is an error before launch naming the rule broken. A `skill` input copies that `SKILL.md` into `<run>/skill/SKILL.md` with `$ARGUMENTS`, `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_SKILL_DIR}` substituted, and the task text becomes "Read and follow <run>/skill/SKILL.md" plus the arguments (D22, D23). That Codex in `read-only` can read the run directory outside its working directory is strong inference, confirmed by TEST-2.

### INTEGRATION-5: run lifecycle

```
<parent>/<repo-dir-name>.collegium/<run-id>/     D18, D57
  state.json   { id, harness, model, effort, chosenBy, mode, cwd, startedAt, deadline, pid, state, exitCode, branch? }
  prompt.md  schema.json  skill/  events.jsonl  last.json  pid  exit  worktree/ (D39)
```

- `<parent>/<repo-dir-name>` is the git top level of the session root (`$.session.root()`), or the session root outside git.
- States: `running`, then one of `done`, `blocked`, `failed`, `timeout`, `conflict` (envelope status, D19, D24). `failed` carries a reason: launch error, logged out, quota or API error from `turn.failed`, unparsable final message, git error.
- Process: started from the `collegium_run` handler, not awaited, through `$.process.spawn` (D16) as `sh -c 'echo $$ > pid; exec codex …'` with the run directory as its `cwd` on both paths (Codex's own working directory is `-C`), so `<run>/pid` holds Codex's pid for `state.json` `pid` (spawn exposes none), events appended to `events.jsonl`, the exit code written to `exit`; the deadline (default 60 min, D19) kills the child and sets `timeout`. If gap G1 resolves against spawn, the same files are produced by a detached child started through `$.process.run(['sh', '-c', 'nohup sh -c "codex … > events.jsonl & echo \$! > pid; wait \$!; echo \$? > exit" </dev/null >/dev/null 2>&1 &'])` — backgrounded with its output redirected, since `$.process.run` holds the call while a child keeps writing and kills it at the timeout — and state is read back from the files (D29).
- Notice: on a terminal state the run joins a pending set; the main-thread `turn.complete` (`!e.agentId`) submits `Collegium run <id> finished: <state>. Call collegium_result.` once per run (D43; gap G2 decides whether an idle session also gets it at once).
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

Input `{ id, wait_seconds? }`, `wait_seconds` 0–600, default 0 (D53). Returns `{ id, state, envelope?, branch?, diffstat?, worktree?, reason? }` once terminal, else `{ id, state: "running", elapsedSec }` after the wait. The watcher's `timeoutMs` is `wait_seconds` × 1000, and its rejection at that timeout reads as `running`, never as an error. With `wait_seconds` 0 no watcher runs: the answer is read once from `state.json` and, when present, the run's `exit` file, which both process paths of INTEGRATION-5 write. A terminal answer triggers the D20 deletion, except the worktree of a `worktree`-mode run.

### UI-1: `/collegium:run` skill

`skills/run/SKILL.md`, `allowed-tools` naming the three tools and `ToolSearch`. Parses `[--harness h] [--model provider/model] [--effort e] [--write worktree|branch|merge] [--skill <path>] <task>`, calls `collegium_run`, prints the id and the chosen model and effort, ends the turn (D58). On the notice it calls `collegium_result` and shows the envelope.

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
- `merge-contract.md` and `cr-merge`: the D55 skip header and Tally clauses; a `codex.md` that is missing or headerless — the scanner itself died — reads as `skipped: codex — no output`, never `incomplete` (D37); Codex counted outside `Lenses: L of A` (D41).
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

`plugins/collegium/tests/*.test.ts`, `claude-code/testing` kit, `on('process.run', …)` stubs branching on `e.argv`, no `node:` imports (`SPEC.session/research/ci-evals.md`, section 2). Cover: config merge (D60, D27 disable-only), palette filtering (D12, D47), choice paths (D5, D48, D56, D59), strict-schema check (D40), Codex argv (D46), the CI path's fetch, exchange and login with stubbed `http.fetch` and a failure message free of tokens (D63, D64), event parsing incl. warning-not-failure, state transitions incl. `timeout` and `conflict`, sweep (D20), skill substitution (D23), write-mode git sequences (INTEGRATION-6).

### TEST-2: manual live script

`plugins/collegium/scripts/live-check.sh`: drives `claude -p` with `--plugin-dir plugins/collegium` against real Codex for one read-only run, one `branch` run in a scratch repository and one skill run; prints each run's state and envelope. Shellcheck-clean (lint.yml runs shellcheck on every `*.sh`).

### TEST-3: eval suite

`plugins/collegium/evals/<case>/` (`case.yaml`, `prompt.md`, `graders/*.md`): `/collegium:run` on a fixture repository returns a `done` envelope whose `result` answers the task; a second case asks for a skill run. Every case passes model `openai/gpt-6-luna` and effort `low` (D65). Allow-tools `ToolSearch 'mcp__collegium__*'`.

### TEST-4: fd3 workflow tests

`plugins/fd3/tests/workflows/implement-review.test.mjs`: `codexReview: true` adds `--codex` to the prepare prompt, dispatches a separate `codex` scanner under the single-scan path, and a skipped Codex review merges without a dead-lens verdict.

### TEST-5: phase-1 probes

Three probes recorded in `evidence/spikes.md`: in an interactive session, an un-awaited spawn started from a `tool.call` handler that has already returned, through one later user Stop, and the D29 fallback's `nohup … &` child outliving the `$.process.run` that started it (G1), whether `$.prompt.submit` from the background completion path or a timer is accepted (G2), and `$.process.hookEnv()` returning `CLAUDE_PLUGIN_DATA` (G4).

### CICD-1: CI eval spike and eval arm

Spike first (D33): a throwaway branch adds a `collegium` arm to `.github/workflows/plugin-evals.yml` — paths filter (`:4-10`), picker branch (`:47-55`), workflow_dispatch list (`:42`), `case` arm (`:105-115`) — installs Codex `0.169.0` with pnpm, gives the `eval` job (`:57`) `permissions: { contents: read, id-token: write }` (the workflow grants only `contents: read`, `:13-14`), passes the D64 variables into the eval step — the three `vars.OPENAI_*` values through `env:`, and `ACTIONS_ID_TOKEN_REQUEST_URL`/`_TOKEN` exported under their `EVAL_` names in the step script — and extends the token guard (`:143-146`) to `ACTIONS_ID_TOKEN_REQUEST_TOKEN` (D63). Outcome rule (G3): the mod sees the variables, reaches GitHub's token URL and `auth.openai.com`, `codex login --with-api-key` accepts the exchanged token and a `done` envelope comes back → the arm lands with TEST-3; otherwise CICD-2 lands instead and TEST-3 stays local.

### CICD-2: unit-test CI job (conditional)

Lands only on the negative CICD-1 outcome: a workflow job that installs Claude Code at the pinned version and runs `claude plugin test plugins/collegium`.

### DOCS-1: collegium documentation and registration

`plugins/collegium/README.md` (requirements: Codex CLI, Claude Code version; enabling; config file; tools contract; data-leaves-machine note K2), `CHANGELOG.md` with `## [Unreleased]`, `.claude-plugin/plugin.json` at `0.0.0` per `.claude/skills/new-plugin/SKILL.md`, the `marketplace.json` entry, and rows in the root `README.md` plugin and requirements tables. Description per D51.

### DOCS-2: code-review documentation

`README.md` section "Codex review (external)", `CONTEXT.md` term "External review", ADR `docs/adr/0005-codex-external-review.md` recording D35–D38, D41, D52, D55, `CHANGELOG.md` `[Unreleased]`.

### DOCS-3: fd3 documentation

`README.md` line on the step-2 Codex question and `CHANGELOG.md` `[Unreleased]`.

### Prerequisites

| Prerequisite | Status |
|---|---|
| Codex CLI installed and logged in on the author's machine | Met — `codex-cli 0.169.0`, standalone install, `codex login status` exit 0, ChatGPT login (`SPEC.session/research/live-harnesses.md`, Summary). |
| Claude Code with mods and `userConfig` `options` | Met locally — 2.1.326; mods need ≥ 2.1.287, `options` ≥ 2.1.271 (`SPEC.session/research/repo-prior-art.md`, section 3). CI pins 2.1.322 (`.github/workflows/plugin-evals.yml:21`). |
| `$.process.spawn` holds a 65-minute child | Met in `claude -p` on 2.1.326: 65 of 65 ticks and exit code 7 in 3901 s, no spawn time cap (I25). Open for an interactive session and a spawn outliving its handler (gap G1). |
| OpenAI WIF provider, service-account mapping and Actions variables (D63) | Met — the user created the provider (issuer `https://token.actions.githubusercontent.com`, audience `https://api.openai.com/v1`) and the mapping on 2026-11-17, and `gh variable list` shows `OPENAI_WIF_AUDIENCE`, `OPENAI_IDENTITY_PROVIDER_ID`, `OPENAI_SERVICE_ACCOUNT_ID` (I26). The mapping's assertions were suggested, not read back from OpenAI. |
| TypeSafe or Gemini Decision key | Optional — without one D6's Haiku fallback chooses. |

## 5. Ownership

| Repository / component | Owns | Apply mechanism |
|---|---|---|
| `grixu/cc-toolkit` `plugins/collegium/` | CONFIG-1, CONFIG-2, INTEGRATION-1–6, API-1–3, UI-1, UI-2, TEST-1–3, DOCS-1 | Pull request to `main`, then `./scripts/release.sh collegium minor` |
| `grixu/cc-toolkit` `plugins/code-review/` | CONFIG-3, INTEGRATION-7, DOCS-2 | Pull request, then `./scripts/release.sh code-review minor` |
| `grixu/cc-toolkit` `plugins/fd3/` | INTEGRATION-8, TEST-4, DOCS-3 | Pull request, then `./scripts/release.sh fd3 minor` |
| `grixu/cc-toolkit` `.github/workflows/`, root `README.md`, `.claude-plugin/marketplace.json` | CICD-1, CICD-2, DOCS-1 rows and entry | Same pull request as the plugin they serve |

One owner (Mateusz Gostański) reviews and merges everything. Releases go only through `scripts/release.sh` (repository `CLAUDE.md`, "Releasing"), which bumps the marketplace version per release. A live run of code-review or fd3 uses the installed release, not the branch (user memory `fd3-run-tuning-0925.md`), so each integration is verified live only after the plugin it depends on is released. The CI eval runs only on same-repository pull requests (`.github/workflows/plugin-evals.yml:28-29`).

## 6. The change, per repository

All items are in `grixu/cc-toolkit`.

### `plugins/collegium` (new)

| # | Work item | Elements | Files | Kind | Phase | Lands as |
|---|---|---|---|---|---|---|
| C1 | Phase-1 probes: the interactive, outlives-its-handler case of G1, probe `$.prompt.submit` after the handler returned and `$.process.hookEnv()`; record in `evidence/spikes.md` | TEST-5 | `.ai/specs/collegium/evidence/spikes.md` | new | 1 | one commit on the spec |
| C2 | Scaffold: manifest with `userConfig`, `hooks.json`, CHANGELOG, README skeleton, marketplace entry | CONFIG-1, DOCS-1 | `plugins/collegium/.claude-plugin/plugin.json`, `hooks/hooks.json`, `CHANGELOG.md`, `README.md`, `.claude-plugin/marketplace.json` | new | 2 | one PR |
| C3 | Decision client copy, byte-identical to dev-kit's | INTEGRATION-3 | `hooks/decision.ts`, `hooks/providers/{index,gemini,typesafe}.ts` | new | 2 | one PR |
| C4 | Config read and merge | CONFIG-2 | `hooks/config.ts` | new | 2 | one PR |
| C5 | Adapter contract and Codex adapter | INTEGRATION-1, INTEGRATION-2 | `hooks/harness.ts`, `hooks/codex.ts` | new | 2 | one PR |
| C6 | Model and effort choice | INTEGRATION-3 | `hooks/choose.ts` | new | 2 | one PR |
| C7 | Prompt wrapper, envelope, strict-schema check, skill substitution | INTEGRATION-4 | `hooks/prompt.ts` | new | 2 | one PR |
| C8 | Run lifecycle, notice, sweep; process model per C1's G1 outcome | INTEGRATION-5 | `hooks/runs.ts` | new | 2 | one PR |
| C9 | Tools and registration | API-1, API-2, API-3 | `hooks/register.ts` | new | 2 | one PR |
| C10 | Write modes | INTEGRATION-6 | `hooks/write.ts` | new | 2 | one PR |
| C11 | `/collegium:run` and `/collegium:config` | UI-1, UI-2 | `skills/run/SKILL.md`, `commands/config.md` | new | 2 | one PR |
| C12 | Unit tests | TEST-1 | `tests/*.test.ts` | new | 2 | one PR |
| C13 | Manual live script | TEST-2 | `scripts/live-check.sh` | new | 2 | one PR |
| C14 | README in full, root README rows, description through D51 | DOCS-1 | `plugins/collegium/README.md`, `README.md`, `plugin.json`, `marketplace.json` | changed | 2 | one PR |
| C15 | CI spike: throwaway branch with the eval arm and the WIF exchange | CICD-1 | `.github/workflows/plugin-evals.yml` | changed | 3 | no merge — a spike branch, outcome recorded in `evidence/spikes.md` |
| C16 | Eval suite, and the eval arm or the unit-test job per C15's outcome | TEST-3, CICD-1 or CICD-2 | `plugins/collegium/evals/**`, `.github/workflows/plugin-evals.yml` or a new workflow job | new / changed | 3 | one PR (PR 1, with phases 1–2, D62) |

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
| 3 | CI spike on a throwaway branch (C15), then eval suite and CI per its outcome (C16); needs the WIF variables (met, I26) | Spike branch, then `feat/collegium` | No | Yes — PR 1 merged, `release.sh collegium minor` (v0.1.0), installed locally |
| 4 | code-review integration (R1–R7) | New branch stacked on `main` after PR 1 merged | Yes — reviews offer or run Codex per `collegium_run` | Yes — PR 2 merged, `release.sh code-review minor`, installed |
| 5 | fd3 integration (F1–F4) | New branch after PR 2 merged | Yes — fd3 asks about or runs the Codex review | Yes — PR 3 merged, `release.sh fd3 minor` |

Orderings: phase 2 needs phase 1's G1 answer merged into C8's design before C8 is written (a development ordering). Inside phase 2, C10 is written before C8 and C9, which call it: `runs.ts` sets `conflict` from the write step and `register.ts` takes the `write` input (a development ordering). Phase 4 needs collegium **released and installed** before its live check (a deploy ordering); its merge does not need it, because the review is tool-gated (D35, D49). Phase 5's `--codex` prepare needs code-review's R3 **released and installed** before fd3's live check; fd3's merge does not need it, but an fd3 release that passes `--codex` to a code-review without R3 hands prepare an argument it does not define (`plugins/code-review/skills/cr-prepare/SKILL.md:21-31`), so phase 5 **merges after** phase 4's release. No environments other than the author's machine and CI exist; there is no bake period beyond the live checks in section 8.

Estimated size of landing unit 1 (phases 1–3): about 35 files and 3,500–4,000 changed lines, from C2–C16 (mod modules about 1,800 lines, the 317-line decision copy, tests about 900, skill, command, README and eval about 700). The user chose not to subdivide it (D62): phases 1–3 land as one pull request.

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
| UI-1 | TEST-3 eval | CI (or local per C15) | — | Threshold met |
| UI-2 | Triggered: run `/collegium:config`, choose project scope | Author's machine | No config file | `.claude/collegium.json` written with the chosen tiers |
| TEST-5 | Probe transcripts in `evidence/spikes.md` | Author's machine | G1, G2, G4 open | Each of G1, G2, G4 recorded as yes or no |
| CICD-1 / CICD-2 | The spike run, then the merged workflow's run on PR 1 | CI | No collegium job | A collegium job green |
| CONFIG-3, INTEGRATION-7 | Triggered: `/start-cr` on a one-file change with collegium installed, Codex enabled, `collegium_run: always` | Author's machine after phase-3 release | No `codex.md` | `codex.md` in the context directory; Tally shows `External review: codex` |
| INTEGRATION-7 skip | Triggered: same with Codex disabled | Author's machine | — | Tally shows `skipped: codex — <reason>`; no menu |
| INTEGRATION-8, TEST-4 | `node --test 'plugins/fd3/tests/workflows/*.test.mjs'`; triggered: an fd3 run with `codexReview: true` | Branch (fd3-evals.yml runs it); author's machine after phase-4 release | — | Pass; the run's review dir holds `codex.md` |
| DOCS-1–3 | `/verify` and the description passes of D51 | Branch | — | `/verify` clean |

Every phase has a row: phase 1 TEST-5, phase 2 the collegium rows, phase 3 CICD and UI-1, phase 4 the code-review rows, phase 5 the fd3 rows. No element is without a row.

## 9. Cleanup

- The CI spike branch (C15) is deleted after its outcome is recorded; nothing on it is merged.
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
| A spawn child is killed only by leaving its loop, `return()`, a `next.signal` abort or module unload — "a hook's return included" does not | `claude-code.d.ts` 4185-4187 as quoted in `SPEC.session/research/spike-spawn.md`, Bounds; not exercised live for a returned handler (gap G1). |
| Mod tools are served as an HTTP MCP server; the 30-min/5-min MCP idle timeout did not cut a 65-minute call on 2.1.326 | `real.debug.log` and the binary's `rd` function (`SPEC.session/research/spike-spawn.md`, Bounds). Why it did not apply is unexplained; `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT=0` disables it if it ever does. |
| Chained `$.process.run` in one `tool.call` ran to 1200 s | Live probe on 2.1.322, user memory `cc-mod-tool-duration.md` (`SPEC.session/research/mod-api.md`, section 1). |
| Mod tools are callable from Agent-tool subagents and workflow `agent()` calls; `$.prompt.submit` is refused inside `tool.call` | Live probes 1–3 on 2.1.326 (`SPEC.session/research/mod-tools-subagents.md`, Verdict, Live probe; refusal text in `evidence/12-appendix.md`). |
| `$.process.hookEnv()` returns `CLAUDE_PLUGIN_DATA` | d.ts only, not run (`SPEC.session/research/mod-api.md`, section 2 and open point 2); gap G4. |
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
| The eval workflow's opt-in points, CC pin 2.1.322 and token guard | `.github/workflows/plugin-evals.yml:4-10,21,42,47-55,105-115,143-146`. |
| No CI job runs `claude plugin test` today | Workflow list `code-review-scripts, docs, fd3-evals, lint, plugin-evals, pullfrog, sync-hookify` (`SPEC.session/research/ci-evals.md`, section 2). |
| Repo secrets hold no `OPENAI_API_KEY` | `gh secret list -R grixu/cc-toolkit`, 2026-11-17 (`SPEC.session/research/INDEX.md` entry I23, inline). |
| The workflow grants only `contents: read`; the eval job starts at `:57` | `.github/workflows/plugin-evals.yml:13-14,57`, read at `d7f6da87`. |
| WIF exchange: endpoint, token-exchange body, Bearer `access_token`, no refresh token, never outlives the subject JWT; authorizes like a service-account key | developers.openai.com/api/reference/workload-identity-federation (`SPEC.session/research/openai-wif.md`, "Token exchange"; quotes in `evidence/12-appendix.md`). |
| The job needs `id-token: write`; the JWT comes from `ACTIONS_ID_TOKEN_REQUEST_URL` + `&audience=` with the request token as bearer; ids are variables, not secrets | developers.openai.com/api/docs/guides/workload-identity-federation/github-actions (`SPEC.session/research/openai-wif.md`, "GitHub Actions side"). |
| A GitHub OIDC JWT lives 300 s, so an exchanged token lives about 5 minutes (K7) | docs.github.com/en/actions/concepts/security/openid-connect example `iat`/`exp`; google-github-actions/auth#474 (`SPEC.session/research/openai-wif.md`, "GitHub OIDC token lifetime"). The 300 s is read from an example token, not a stated limit. |
| Codex's native WIF path is a ChatGPT-workspace beta, not usable here | WIF guide's Codex section (`SPEC.session/research/openai-wif.md`, "Codex native WIF"). |
| `codex login --with-api-key` accepting a WIF access token | Unverified; both are Bearer tokens, so inference only — gap G3, settled by C15. |
| The WIF provider, mapping and three Actions variables exist | `gh variable list -R grixu/cc-toolkit` by the user, 2026-11-17 (`SPEC.session/research/openai-wif.md`, "Repository state"); mapping assertions not read back. |
| A mod can make HTTP requests through `$.http.fetch` | `plugins/dev-kit/hooks/decision.ts:54`. |
| `gpt-6-luna` is "Fast and affordable model for easier tasks"; `low` is "Fast responses with lighter reasoning" (D65) | `jq` over `SPEC.session/research/codex-models.json` (`description`); `SPEC.session/research/live-harnesses.md`, effort descriptions. |
| New-plugin scaffold and marketplace entry shape; marketplace at 1.17.0 with 11 plugins | `.claude/skills/new-plugin/SKILL.md`; `.claude-plugin/marketplace.json:4`, `jq '.plugins\|length'` = 11. |
| fd3 worktrees live beside the repository as `<repo>.worktrees/` | `plugins/fd3/workflows/implement-run.js:77`. |
| Landing unit 1 exceeds the size the user reviews in one PR | Estimate from C2–C16 and the 317-line decision copy (`wc -l plugins/dev-kit/hooks/decision.ts plugins/dev-kit/hooks/providers/*.ts`); inference, not a measurement. |

### Declared gaps

| # | Gap | Owner | Placement |
|---|---|---|---|
| G1 | Whether, in an interactive session, a spawn started un-awaited from the `collegium_run` handler survives the handler's return and a later user Stop; the d.ts says a hook's return does not kill it, but a `next.signal` abort does. Rule: it survives → INTEGRATION-5 uses spawn; it is killed → the detached fallback of D29, whose child C1 also probes. | Spec team | Blocks C8; settled by C1 (TEST-5) |
| G2 | Whether `$.prompt.submit` issued after the `collegium_run` handler returned (from the completion path or a `$.clock.after` timer) is accepted. Rule: accepted → submit at completion so an idle session gets the notice at once; refused → main-thread `turn.complete` only (D43), and an idle session sees it at its next turn. | Spec team | Blocks C8; settled by C1 |
| G3 | Whether a mod inside `claude plugin eval` sees the D64 variables and reaches GitHub's token URL and `auth.openai.com` through `$.http.fetch`, whether `codex login --with-api-key` accepts a WIF access token, and whether Codex reaches the network from there (K4). Rule: CICD-1's outcome rule (D33). | Spec team | Blocks C16; settled by C15 |
| G4 | Whether `$.process.hookEnv()` returns `CLAUDE_PLUGIN_DATA` on 2.1.326 and 2.1.322. Rule: returned → CONFIG-2 as written; not → the user-level config is kept in `$.store` under key `user-config` and `/collegium:config` writes it through an added `collegium_config` tool. | Spec team | Blocks C4; settled by C1 |
| G5 | Whether naming the Collegium tools in `agents/scanner.md` `tools:` lets a workflow scanner call them without a permission prompt. Substitute: the phase-5 triggered fd3 run; a denied call shows as `skipped: codex — permission denied` (D55), never as a dead review. | Spec team | Phase 5 verification row |
| G6 | Whether `claude plugin configure code-review --json` prints the saved `collegium_run` on the installed version. Rule: printed → D54; not → step 2 asks whenever Collegium is installed with Codex enabled. | Spec team | Phase 5, F1 |

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
