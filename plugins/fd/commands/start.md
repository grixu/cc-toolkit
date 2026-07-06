---
description: "Create a feature spec from a topic (grill → spec → validate DoR). Explicitly user-run only; never model-invoked, never auto-chains."
argument-hint: "[topic]"
disable-model-invocation: true
---

Build a validated, grounded spec for one new feature from a **topic** (`$ARGUMENTS`) and
scaffold its directory, ready for `/fd:to-tasks`. Skip document ingest — that is
`/fd:from-docs`. This command is a discrete unit: it ends at its boundary, reports, and
hands control back. It never runs the next command.

## Paths & scripts (this command is an executable prompt)

Plugin files resolve from the plugin root via `${CLAUDE_PLUGIN_ROOT}`:
- hasher (read-only, run on entry and after every persist):
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/hasher.mjs" <featureDir> --features-root <featuresRoot>`
  → stdout JSON `{elements:{ID:hash}, specHash, unknownKinds:[], tasks:{...}, tasksHash}`.
- projections: `node "${CLAUDE_PLUGIN_ROOT}/scripts/project-maps.mjs" <featureDir>` (writes
  `ac-map.json`, `sc-map.json`).
- migration: `node "${CLAUDE_PLUGIN_ROOT}/scripts/migrate.mjs" <featureDir> [--dry-run]`.
- schema check for any JSON artifact you read or write:
  `node --input-type=module -e "import { loadAndValidate } from '${CLAUDE_PLUGIN_ROOT}/scripts/lib/validate.mjs'; const r = loadAndValidate(process.argv[1], process.argv[2]); if (!r.valid) { console.error(JSON.stringify(r.errors, null, 2)); process.exit(1); }" <file.json> <schema.json>`

These paths resolve inside the loaded plugin (installed or `--plugin-dir`). A referenced file
missing after **one** direct check ⇒ STOP and report a broken fd installation — never search
the repo or `$HOME` for plugin files. Invoke scripts via the one-liners above; do not read
their source.

Always judge staleness against **fresh hasher output**, never against stored `state.json`
fields. Write JSON pretty (2-space), trailing newline, and validate against its schema
before moving on. HIL questions use `AskUserQuestion` in this main thread only.

## Preconditions (gates)

1. **Config** — read `.claude/fd-config.json`; if missing, unparsable, or it fails
   `fd-config.schema.json` (including `schema` mismatch), **halt**: "run `/fd:config`" and
   STOP. On success, hold `language.default`, `storage.*`, `validation.*`.
2. **Cold start** — derive everything from the workspace and this invocation; never rely on
   a previous command's context.

## Flow

1. **Slug + scaffold.** Generate a short, descriptive kebab-case `slug` from the topic
   (shared generator with `/fd:from-docs`). Resolve the feature dir from config: per-feature →
   `<featuresRoot>/<slug>/`; shared → `<specsRoot>/<slug>/` (with `CONTEXT.md`/ADRs routed per
   `storage.docs` when set, else per the storage mode (see the loaded GRILLING reference)). **Collision** (dir already exists) → **HIL**: (a) continue on the
   existing feature — then treat this as a spec mutation and follow `/fd:grill` (entry
   reconcile against the manifest, reconcile-plan HIL before persist); or (b) supply a new
   slug and scaffold fresh. Do not overwrite an existing feature.
2. **Bounded context (shared + per-bounded-context only).** Read
   `storage.shared.boundedContextsFile`; propose the BC whose `match` globs fit the feature's
   area → **HIL** confirm (or pick another) → record `state.json.boundedContext`. In all other
   modes leave it `null`.
3. **Init state.** Determine `language`: a per-invocation override in the topic wins, else
   `language.default`. Write `state.json` (validate against `state.schema.json`):

   ```json
   { "schema": 1, "slug": "<slug>", "title": "<short title>", "language": "<lang>",
     "createdFrom": "topic", "phase": "spec", "boundedContext": null, "branch": null,
     "specHash": null, "tasksHash": null, "waveInProgress": false, "manifest": "feature.lock.json" }
   ```

   Write a **minimal valid** `feature.lock.json` (validate against `feature-lock.schema.json`):
   `spec.hash: null`, empty `history`, empty `elements`/`tasks`, and seed `idCounters` (all
   seed KINDs plus `T`, each `0`): `{ "DB":0,"API":0,"CFG":0,"OBS":0,"INF":0,"INT":0,"MOD":0,"DESIGN":0,"AC":0,"FR":0,"NFR":0,"T":0 }`.
4. **Grill (main thread).** Load and follow `${CLAUDE_PLUGIN_ROOT}/references/GRILLING.md`
   and `${CLAUDE_PLUGIN_ROOT}/references/BUILDING_SPEC.md`. Build the agenda from the topic
   plus the project's code context, then drill gaps / ambiguities / contradictions with the
   user one item at a time. Each resolved item materializes immediately in `spec.md` as an
   ID-anchored element block (append-only IDs) or an AC carrying a `covers:` line. Maintain
   `CONTEXT.md` (`${CLAUDE_PLUGIN_ROOT}/references/CONTEXT-FORMAT.md`) and record decisions as ADRs
   (`${CLAUDE_PLUGIN_ROOT}/references/ADR-FORMAT.md`), routed per `storage.docs` when set, else per the storage mode (see the loaded GRILLING reference). **Ground every external claim
   the moment it enters the spec** by fanning out the `researcher` subagent (one per claim or
   a batch) — never search/fetch in this thread; append its returned records to
   `sources-map.json` (validate against `sources-map.schema.json`). If a grounding channel is
   unreachable, compute `groundingDegraded` from runtime tool reachability and warn (best-effort,
   not a hard stop). The loop ends when the agenda is empty or the user closes it.
5. **Persist + hash.** Save `spec.md`. Run the hasher. If `unknownKinds` is non-empty, a
   heading matches the anchor grammar but its `KIND` is outside `idCounters` → **HIL** (accept
   the new `KIND` → add it to `idCounters`; or it is a typo → fix `spec.md` and re-hash).
   Then update `feature.lock.json`: set `spec.hash` = fresh `specHash`; append a `history`
   entry `{ hash: specHash, at: <ISO>, summary: "init" }`; for each element set
   `{ hash, version: 1, status: "pending" }`; bump each `idCounters[KIND]` to its high-water
   mark. Set `state.json.specHash` = fresh `specHash`. Run `project-maps.mjs` to compute
   `ac-map.json` from the `covers:` lines. Validate every written artifact against its schema.

## Validation tail (spec DoR — `block → verdict`)

Run after persist, always.

1. Read `validation.dimensions.spec` from config. Full v1 set: `structural`, `coverage`,
   `grounding`, `feasibility`, `decomposability`, `non-over-spec` (semantics:
   `${CLAUDE_PLUGIN_ROOT}/references/BUILDING_SPEC.md`). Run the configured subset.
2. Fan out **one `validator` subagent per configured dimension** (parallel — dispatch them in
   one message and await their completions directly, never `sleep`/poll). Each prompt carries the
   dimension name, the feature dir (absolute), and the dimension's check semantics (inline or
   pointed at `BUILDING_SPEC.md`). Validators read artifacts fresh from disk and return
   `{dimension, checks:[{id, verdict, evidence}], blockingDoubts:[], advisoryDoubts:[]}`. The
   `grounding` validator may spawn nested `researcher` subagents to probe citation coverage.
3. **Aggregate.** Collect every `fail` check id into `failedChecks`.
4. **Doubts.** Ask each **blocking** doubt here via `AskUserQuestion` (subagents cannot ask; an
   answer is required before a verdict); fold the answer into the spec/manifest if it changes an
   element, then re-hash. **Advisory** doubts are reported to the human but never force a re-run.
   Re-run **only** the dimensions whose in-scope elements changed since they last passed — not
   the whole set — and add no speculative confirm round after a fix the model already justified.
5. **Waivers** (only if `validation.allowWaiver`; the model **never** waives). For each
   remaining fail a human may waive it. Before overwriting a prior `readiness.spec`, compare
   its `waivedChecks` to the new fails: for a `checkId` that still fails and was previously
   waived, show the prior waiver and ask **one** confirmation to renew; on yes, log
   `{ id, by: "human", at: <ISO> }` and move it from `failedChecks` to `waivedChecks`. A new
   fail needs an explicit human waiver decision too.
6. **Verdict.** `verdict = ready` iff `failedChecks` is empty (after waivers); else `blocked`.
   Write `state.json.readiness.spec = { verdict, validatedHash: <fresh specHash>, dimensionsRun:
   <configured subset>, failedChecks, waivedChecks }`. Validate `state.json` against its schema.

## Output / checkpoint

Report: the DoR verdict (`ready`, or `blocked` + the failing checks), `dimensionsRun` shown
against the full v1 set (so any config-narrowed run is visible), whether grounding was
degraded, and the artifact locations (`spec.md`, `feature.lock.json`, `ac-map.json`,
`sources-map.json`, `CONTEXT.md`). Then a **one-line prose** suggestion of the likely next
step — `/fd:grill` if `blocked` or the user wants to keep drilling, else `/fd:to-tasks` — and
**stop**. Do not offer to run it; do not invoke any fd command via the Skill tool.

## Edge cases

- **Trivial topic** — a spec is still valid with few elements; the validation tail still runs.
- **Unknown `KIND` from the hasher** — handled in Persist as an HIL, before the verdict.
- **Grounding channels down** — warn with `groundingDegraded`; the grounding dimension still
  reports missing citations as fails (degradation does not hide gaps).
- **Manual edit later** — any edit to `spec.md` outside the commands diverges `specHash`, which
  makes the stored verdict stale/invalid; re-validate via `/fd:grill`.
- **Schema migration** — only when continuing on an existing feature (the collision re-run
  path): a workspace artifact with a **lower** `schema` → `migrate.mjs --dry-run`, show the
  report, HIL, then apply (backup first); a **higher** `schema` → hard halt "workspace requires
  a newer fd plugin".
