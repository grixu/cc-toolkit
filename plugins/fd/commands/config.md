---
description: Detect the project stack, gather your storage/tooling/validation choices, and write .claude/fd-config.json — the prerequisite every other fd command checks on entry. Run this first, and re-run any time to update.
disable-model-invocation: true
---

# /fd:config

Detect the stack, run a full human-in-the-loop pass, validate, and write `.claude/fd-config.json`. Detection only prefills defaults; every run re-asks the choices. Idempotent: the same answers produce the same file.

The commented schema is `${CLAUDE_PLUGIN_ROOT}/examples/config.example.jsonc`; the enforced JSON Schema is `${CLAUDE_PLUGIN_ROOT}/schemas/fd-config.schema.json`.

These paths resolve inside the loaded plugin (installed or `--plugin-dir`). A referenced file missing after **one** direct check ⇒ STOP and report a broken fd installation — never search the repo or `$HOME` for plugin files.

**Script contract (applies to every shipped script):**
- Scripts are EXECUTED via the documented one-liners — their stdout JSON is the whole
  interface. Never `Read` a script's `.mjs` source into context; running one with wrong or
  missing args prints a usage error, and that error is the documentation.
- Reading a script's source is allowed only to diagnose an execution that already failed —
  say so explicitly when you do.
- Never re-implement a shipped script inline (hand-assembled state JSON, one-off replacement
  scripts). A job no shipped script covers is a gap: report it, do not work around it.

## Preconditions

`/fd:config` is the entry to the system — **it is the one command that runs without an existing config**, so it does NOT apply the config gate to itself. Every other command halts on a missing/unparsable/schema-mismatched config and points here. `/fd:config` does not select a feature, run the hasher, or migrate a workspace — it owns only `.claude/fd-config.json` (and, when the mode requires it, scaffolding `bounded-contexts.json`).

## Flow

### Phase 0 — Load existing config as prefill

If `.claude/fd-config.json` exists and parses, load it and use every field as the prefill for the HIL below. If it is present but unparsable, keep going (this command repairs it) but tell the user you are starting from detection defaults.

### Phase 1 — Detection (in order)

Detect each field carrying an internal `{value, source, confidence}` triple that drives Phase 2 classification (only the resolved values persist to the file). Order:

1. **Stack / language** — manifest and lockfiles (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, …), source layout.
2. **Package manager** — lockfile (`pnpm-lock.yaml` → pnpm, `package-lock.json` → npm, `yarn.lock` → yarn), `packageManager` field.
3. **build / lint / test / format commands** — `scripts` in the manifest, Makefile/justfile targets, tool configs (eslint, prettier, biome, ruff, …).
4. **CI** — `.github/workflows/*`, `.gitlab-ci.yml`, etc.; use it only to corroborate the four commands above and to note in the report — CI is not a config field.
5. **MCP servers reachable** — `mcp.detected` is the set of grounding/graph MCP servers reachable **as tools in this session**: firecrawl, context7, codebase-memory-mcp. Read the tool namespace already present in this session (each server exposes `mcp__<server>__*` tools); do **not** shell-ping or spawn anything to test them. Record the subset that is present. This is a snapshot for `mcp.detected` only.
6. **Dynamic-workflows availability** — default `implement.engine` to `"workflow"` unless dynamic workflows are **known-unavailable** (e.g. an explicit `disableWorkflows` setting); `workflow` auto-falls-back to subagents at runtime, so it is the safe default. No shell probe — do not try to detect the Claude Code version or plan tier.
7. **`node` binary** — `node --version`. This is a **hard requirement of the plugin's scripts** (hasher, projections, estimator, migrations), independent of the project stack.

### Phase 2 — Classify certainty

Per detected field: exactly one candidate → prefill it; more than one candidate → **HIL disambiguation** (AskUserQuestion, pick the right one); none → hand to the missing-tooling policy below.

### Phase 3 — Full HIL (re-asked every run)

Detection only prefills; always walk the user through the choices below, prefilled with Phase 0/1/2 values. Batch **all non-conditional questions into as few AskUserQuestion calls as possible** (main-thread HIL; the tool takes at most 4 questions per call) — do not fire a prompt per field:

- **Storage mode** — `per-feature` (default) or `shared`; this fixes where the **spec + tasks + manifest** live. Ask `featuresRoot` (default `docs/features`) — **the features path is set HERE** (a custom path arrives via the "Other" answer); make the question text say so explicitly, because the next question is about docs only.
- **Docs location** — an always-asked, explicit question: *where do `CONTEXT.md` and ADRs live for this project?* This is **not** the specs/tasks path (that was the previous question — a path answered here by mistake should trigger a reconciliation follow-up, not a silent guess). Options are derived from detection (an existing `docs/CONTEXT.md`/`docs/adr`, a per-feature layout, a bounded-context registry). The answer is recorded into `storage.docs` and is **decoupled from storage mode** (per-feature specs with a shared `adrRoot` is legal):
  - `per-feature` → `CONTEXT.md` + ADRs live in the feature dir (`contextFile`/`adrRoot` unused).
  - `per-app` → shared `contextFile` (+ optional `adrRoot`).
  - `per-bounded-context` → `boundedContextsFile` (+ optional `adrRoot`).
- **Default language** (`language.default`, default `en`). When the language tokenizes densely (e.g. Polish), suggest `tasks.charsPerToken` of `3`–`3.5` instead of `4` so the token estimator stays honest.
- **Code-review skills** (`codeReview.skills`, ≥1) used by the implementation loop.
- **Task context budget** (`tasks.maxContextTokens`) — the cap on an assembled task file plus its copied dependencies. Options: `250000` (default / recommended — targets models with a ≥512k context window, e.g. Opus 4.8), `120000` (mid-size windows), `40000` (small windows / conservative).

Conditional follow-ups (only when the answers above trigger them): `shared` storage mode needs `storage.shared.*` (`contextMode`, `contextFile`, `adrRoot`, `specsRoot`, `boundedContextsFile`); a `per-bounded-context` docs location needs `storage.docs.boundedContextsFile`.

Everything else is **defaulted WITHOUT asking** — the remaining `tasks.*` knobs (granularity bias, optional hard limits), `implement.*` (branch template, repair-iteration cap, engine, CI scope `ciScope: "full"`, worktree setup/cleanup), `prs.*`, `validation.*`. These defaults are listed in the Phase 6 report for review. Any **non-default** value the model chooses on the user's behalf (e.g. a non-empty `implement.worktreeSetup`) must be either an explicit option in the batched question or flagged for confirmation — **never silently written**.

Do **not** ask for the per-feature bounded-context here — that choice happens at feature creation (`/fd:start`, `/fd:from-docs`).

### Phase 4 — Validate before write (block → HIL)

Any failure below **stops the write**, is presented to the user to fix or consciously confirm, and loops back — never silently guessed. Reuse the Phase-1 detection results here — do **not** re-run `node --version` or re-detect the package manager; the pre-write step's genuinely new work is path writability and stamping `detectedAt`:

- **`node` present** — reuse the Phase-1 `node` result. If it was absent, **BLOCK**: without it the hasher and projections cannot run. Do not write the config.
- **tooling + `implement.worktreeSetup` commands exist / are executable** — resolve each configured command (an executability check, e.g. `command -v` on the binary, is fine; re-detecting *which* package manager the repo uses is not — that was Phase 1); a missing/non-executable one is a block until fixed or confirmed-none.
- **Each `codeReview.skills` entry resolves to an invocable id** — for every selected skill:
  1. **Source of truth for invocability is the session's available-skills list** (the skills the Skill tool can actually reach right now), NOT the filesystem — a `SKILL.md` sitting in a plugin cache or marketplace checkout proves nothing about reachability, and a session-provided skill may have no `SKILL.md` on disk at all. Persist the id **exactly as the session lists it**. Do not sweep `$HOME`/plugin caches hunting for definitions.
  2. Consult the on-disk `SKILL.md` frontmatter (or command-file frontmatter for slash-command skills) **only** to check `disable-model-invocation: true` — such a skill is unreachable by the Skill tool and for preload → re-ask. Definition not found on disk but present in the session list → keep it (session list wins), note it in the report.
  3. The **canonical invocable id** is whatever form the session lists: a bare name for a top-level skill (`code-review`), `plugin:skill` for a plugin-scoped one (`fd:grill`). A plugin whose skill shares its name legitimately yields a doubled id (`quality-review:quality-review`) — that is the normal form for such plugins, not an error.

  Worked example — a correct entry list: `"skills": ["code-review", "quality-review:quality-review", "fd:grill"]` (a built-in top-level skill by bare name; a plugin whose skill is named like the plugin as `plugin:skill` — doubled is correct there; a plugin-scoped skill as `plugin:skill`). Wrong: `"quality-review"` bare when the session lists only `quality-review:quality-review` — a bare id the session does not list resolves to nothing at `/fd:implement` time.
- **Storage paths writable** — `featuresRoot` (and, in shared mode, the shared roots; plus any `storage.docs` `contextFile`/`adrRoot`/`boundedContextsFile` directory) can be created/written.
- **Grounding MCP present** — firecrawl + context7 are recommended, not required; absence is a **warning only** (grounding degrades to best-effort). `groundingDegraded` is NOT a config field — it is computed at runtime by consumers from actual tool reachability.

Then **propose** (do not apply) adding the `tooling.*` commands to the user's permission allowlist — e.g. `Bash(pnpm build:*)`, `Bash(pnpm test:*)`, `Bash(pnpm lint:*)`, `Bash(pnpm format:*)`. The `/fd:implement` wave workflow runs in `acceptEdits` and inherits the allowlist; a command outside it interrupts a run with a mid-flight prompt. Print the suggested entries and tell the user to add them (via `/permissions` or `.claude/settings.json`). **Never edit settings yourself.**

### Phase 5 — Write (idempotent, schema-validated)

Create `.claude/` if needed. Write `.claude/fd-config.json` as 2-space JSON with a trailing newline, keys per the schema — including the `storage.docs` block from the docs-location answer. Validate the written file:

```bash
node --input-type=module -e "import { loadAndValidate } from '${CLAUDE_PLUGIN_ROOT}/scripts/lib/validate.mjs'; const r = loadAndValidate('.claude/fd-config.json', '${CLAUDE_PLUGIN_ROOT}/schemas/fd-config.schema.json'); if (!r.valid) { console.error(JSON.stringify(r.errors, null, 2)); process.exit(1); } console.log('valid');"
```

If validation fails, do not leave a broken file — report the errors and return to Phase 3/4. Set `detectedAt` to the current UTC timestamp.

When a `per-bounded-context` mode is in effect — `storage.shared.contextMode` (shared storage) or `storage.docs.contextMode` (docs location) — AND the referenced `boundedContextsFile` does not exist, scaffold an empty registry there (`{ "schema": 1, "boundedContexts": [] }`, schema `${CLAUDE_PLUGIN_ROOT}/schemas/bounded-contexts.schema.json`). It is user-editable and lives outside `fd-config.json` on purpose.

### Phase 6 — Report

Summarize what was **set** (from HIL, incl. the resolved docs location — where `CONTEXT.md` and ADRs will live per `storage.docs`), **defaulted** (unchanged defaults, incl. the not-asked `tasks.*`/`implement.*`/`prs.*`/`validation.*` knobs so the user can review them), and **undetected** (nulls / warnings, incl. any grounding-degraded warning and the proposed allowlist entries). Call out any non-default value the model chose on the user's behalf. End with a one-line prose suggestion of the likely next step: `/fd:start` (spec from a topic) or `/fd:from-docs` (spec from documents). Suggest — never run it.

## Missing-tooling policy

Distinguish **not-detected** (ask the user) from **confirmed-none** (write `null` for that `tooling.*` field). Critical tooling — `build`, `test`, `lint`, `format` — that is undetected raises a **warning + explicit user confirmation** before proceeding; the value feeds the CI-flow in `/fd:implement`, so it is never silently guessed.

## Gates

| Gate | Type |
|---|---|
| Docs location — where `CONTEXT.md`/ADRs live (per-feature / per-app / per-bounded-context → `storage.docs`) | HIL |
| `storage.shared.contextMode` (per-app / per-bounded-context), shared storage only | HIL |
| Critical tooling undetected | warning + confirmation |
| `node` missing (plugin-script requirement) | block → HIL |
| Pre-write validation (paths, skills, commands) | block → HIL |

The "missing config" gate is enforced by the **other** commands on entry; here the deep validation is `/fd:config`'s own job, not a cheap parse check.

## Edge cases

- **No project manifest / bare repo** — detection yields mostly nulls; ask, mark critical tooling confirmed-none only on explicit user confirmation, and write a minimal valid config.
- **Existing config with a newer `schema`** than this plugin supports — do not downgrade; report that the workspace expects a newer `fd` and stop.
- **CR skill selected but disabled** (`disable-model-invocation: true`) — reject in Phase 4 and re-ask; a config that names an unreachable skill would break `/fd:implement`.
- **MCP probe inconclusive** — record the Phase-0 `mcp.detected` prefill as the fallback and emit the grounding warning; do not block.
