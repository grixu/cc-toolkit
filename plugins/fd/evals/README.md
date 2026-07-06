# fd — promptfoo e2e eval suite

Repeatable [promptfoo](https://www.promptfoo.dev/) smokes for the `fd` (feature-delivery)
plugin. Each test drives the **real command** — the plugin is loaded through the Claude
Agent SDK and the command is invoked by its slash name — then asserts on the **artifacts it
wrote to disk**. This is the e2e layer of the plugin's test strategy (`docs/IMPLEMENTATION.md`
§4); the deterministic logic (hasher, projections, migrations, schema validation) is covered
far more densely by the golden `node:test` suites in `plugins/fd/tests/`.

This is dev tooling — it is **not** shipped as part of the plugin runtime.

## Layout

```
evals/
  promptfooconfig.yaml     # one provider + three tests (config / start / staleness)
  prompts/                 # one slash-command prompt per scenario (config.txt, start.txt, staleness.txt)
  asserts/                 # one JS disk-artifact assertion per scenario
  fixtures/                # pristine per-scenario project/workspace (committed, never mutated)
  reset-sandbox.sh         # copies fixtures/ -> .sandbox/ (git-ignored) before every run
  .sandbox/                # throwaway per-run working dirs (git-ignored; created by reset)
```

Node dev deps (`@anthropic-ai/claude-agent-sdk` + `promptfoo`) and the run scripts live at
the **repo root** (`package.json`, single shared `node_modules`), not per-plugin.

## The three scenarios

| Test | Command | Fixture | Asserts (on disk, after the run) |
|------|---------|---------|----------------------------------|
| CONFIG | `/fd:config` | small pnpm/TS project | `.claude/fd-config.json` exists, parses, `schema:1`, `tooling` reflects the pnpm `build/lint/test/format` scripts, and validates against `fd-config.schema.json` |
| START | `/fd:start <topic>` | project with a valid `fd-config.json` | `docs/features/<slug>/spec.md` has ≥1 valid anchor block; `state.json` parses, `phase=="spec"`, `readiness.spec.verdict ∈ {ready, blocked}`; `feature.lock.json` parses, `elements` non-empty, `spec.hash` is a real sha256 — both validated against their schemas |
| STALENESS | `/fd:grill <slug>` | pre-drifted workspace | `feature.lock.json` marks **exactly** the tasks that produce/consume the edited element stale (`T-001`, `T-002`) and leaves the independent `T-003` non-stale; manifest still validates |

Assertions are plain JavaScript files (`asserts/*.js`) that read the artifacts and
re-validate them with the plugin's own `scripts/lib/validate.mjs`. They are **free,
offline, and deterministic** — no `llm-rubric`, no grader provider. Because plugin skills
load via Agent-Skills injection (not a `Skill()` tool call), `metadata.skillCalls` stays
empty; the disk artifacts are the "the command actually ran" signal. A run that produces
**no** artifacts almost always means the command didn't register — check the plugin path
(see below).

## Prerequisites

- `pnpm install` at the **repo root** (installs the SDK + promptfoo into the shared root
  `node_modules`).
- A logged-in Claude Code CLI. The target runs on your **subscription**
  (`apiKeyRequired: false`) — no `ANTHROPIC_API_KEY` needed.
- `node` on PATH (the plugin scripts and the assertions require it).

## Run

All commands run from the **repo root**:

```bash
pnpm install

# cheap smoke — ONLY the /fd:config scenario (resets the sandbox first)
pnpm eval:fd:config

# full suite — all three scenarios (resets the sandbox first)
pnpm eval:fd

# structural check only (free; does NOT run the model)
./node_modules/.bin/promptfoo validate config -c plugins/fd/evals/promptfooconfig.yaml

# browse the last results
./node_modules/.bin/promptfoo view
```

Both `pnpm` scripts run `reset-sandbox.sh` as a pre-step, so every run starts from pristine
fixtures. Results are written to `/tmp/eval-fd.json` / `/tmp/eval-fd-config.json`.

> The aggregate `pnpm eval` (which runs *every* plugin's suite via `scripts/run-evals.sh`)
> discovers this suite too but does **not** reset the sandbox — always use `pnpm eval:fd` /
> `pnpm eval:fd:config` for fd. Without a reset the git-ignored `.sandbox/` is absent, so the
> provider fails fast ("working dir does not exist") rather than running against stale state.

To focus a scenario while iterating, forward promptfoo's filter flag (matches the test
description as a regex):

```bash
bash plugins/fd/evals/reset-sandbox.sh
./node_modules/.bin/promptfoo eval -c plugins/fd/evals/promptfooconfig.yaml --filter-pattern START
```

## Sandboxing & cleanup

fd commands **mutate their working directory** (write `.claude/fd-config.json`, scaffold
`docs/features/…`, rewrite the manifest). To keep runs off the repo:

- `fixtures/<scenario>/` is the **pristine, committed** source — never touched by a run.
- `reset-sandbox.sh` wipes and recreates `.sandbox/<scenario>/` as a fresh copy of the
  fixture (dotfiles included, so each `.claude/` comes along).
- `.sandbox/` is in the root `.gitignore`; nothing a run writes ever dirties git.
- Each test points the agent at its own sandbox via a per-test `options.working_dir`
  override; the provider's default `working_dir` is the git-ignored `.sandbox` root, so even
  a misconfigured test can only write inside ignored space, never into the repo.

Cleanup is just re-running the reset (or `rm -rf plugins/fd/evals/.sandbox`). The `pnpm`
scripts reset automatically, so there is no manual teardown between runs.

## How the fd commands are triggered

fd ships **commands** (not auto-invoked skills), each with `disable-model-invocation: true`.
That flag blocks the *model* from auto-invoking them but does **not** block explicit
user/slash invocation — so each prompt file contains a literal slash command
(`/fd:config`, `/fd:start <topic>`, `/fd:grill <slug>`). The Agent SDK dispatches slash
commands straight from the `query()` string prompt, so the command runs verbatim.

Two promptfoo details make this work:

- A `prompts:` entry that **starts with `/` is parsed by promptfoo as a file path**. We
  route the slash command through a `{{message}}` prompt whose value is loaded per-test from
  `prompts/<scenario>.txt` (a `file://` var loads the file's text). The rendered value
  begins with `/` but reaches the provider verbatim.
- fd commands are interactive (grill loop, HIL gates). `ask_user_question.behavior:
  first_option` answers every `AskUserQuestion` with its first option, keeping runs
  unattended. **The fixtures and prompts are designed so the first option is the sane one**
  (tiny, well-scoped topic for START; "just reconcile, accept the plan" for STALENESS).
  This is the most fragile assumption in the suite — if a command reorders its HIL options,
  START/STALENESS can wander. CONFIG is the robust one and is the intended cheap smoke.

## The staleness fixture (truthful baseline)

`fixtures/staleness/` ships **pre-drifted**: the workspace was built consistent, then a
single element was edited so the recorded hashes are a truthful baseline the reconcile can
diff against.

- Spec has three elements (`API-1`, `MOD-1`, `DB-1`) and three tasks: `T-001` produces
  `API-1`, `T-002` consumes `T-001::API-1@v1`, `T-003` produces `DB-1` (independent).
- `feature.lock.json` / `state.json` hold the **real** hashes captured by running
  `node plugins/fd/scripts/hasher.mjs <featureDir> --features-root <root>` on the consistent
  version.
- Then `API-1`'s body was edited (added an idempotency key). Re-running the hasher confirms
  only `T-001`'s and `T-002`'s `inputHash` move off baseline; `T-003` is unchanged — so the
  correct reconcile marks exactly `{T-001, T-002}` stale.

To rebuild after intentionally changing the fixture: revert `API-1` to the pre-edit body,
run the hasher, paste the fresh `elements` / `tasks` hashes + `specHash` + `tasksHash` into
`feature.lock.json` and `state.json`, then re-apply the `API-1` edit. (The assertion checks
task **status**, not hashes, so it tolerates the grill rewriting element hashes on apply.)

## Notes & knobs

- **Model.** Target defaults to the `sonnet` alias (current Sonnet on the subscription).
  Set `providers[0].config.model: opus` for a stricter gate on the harder START/STALENESS
  runs. CONFIG passes comfortably on Sonnet.
- **Cost guard.** `max_budget_usd: 6` per run. CONFIG is cheap; START/STALENESS run a grill
  + validators and cost more. START's fixture narrows `validation.dimensions.spec` to
  `["structural"]` so the DoR tail spawns one validator and never fans out the researcher.
- **`allow_all_tools: true`.** Unlike the read-only `comment-review` suite, fd must
  Write/Edit files, run Bash, and spawn Task subagents; the provider's default
  (`working_dir` ⇒ read-only `Read/Grep/Glob/LS`) would block them.
- **`setting_sources: []`** keeps this repo's `CLAUDE.md`/hooks out of the run, so results
  reflect the plugin, not the surrounding harness.

## promptfoo / SDK behaviours this suite depends on

Verified against the installed `promptfoo@0.121.17` + `@anthropic-ai/claude-agent-sdk@0.3.197`:

- **Plugin path resolves relative to the config dir**, not the cwd or `working_dir`. Config
  dir is `plugins/fd/evals`, so the plugin is `path: ..` (→ `plugins/fd`). (Caveat: the
  `comment-review` suite uses `path: plugins/comment-review`, which under this promptfoo
  version resolves to a non-existent nested path — copy the resolution rule from here, not
  from there.)
- **Per-test `options.<field>` overrides the provider's `config.<field>`** for that test.
  That is how each test gets its own `working_dir` from a single provider block.
- **`working_dir` resolves relative to the config dir** (same anchor as the plugin path).
- **A `file://…txt` var loads the file's trimmed text** into the variable; that is how the
  per-test slash command reaches the `{{message}}` prompt.
