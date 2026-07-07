---
description: "Drill and change an existing feature spec + reconcile + re-validate DoR. Explicitly user-run only; never model-invoked, never auto-chains."
argument-hint: "[slug]"
disable-model-invocation: true
---

Drill and mutate an **existing** spec: the user sharpens a topic, corrects requirements, or
brings new information. This is the interactive mutation path after a spec exists (the other
is a `/fd:from-docs` re-run with new sources — both share this grill block and reconcile). It
never writes task files — it marks affected tasks `stale` and points to `/fd:to-tasks`.
`$0` is an optional `<slug>`. A discrete unit: it ends at its boundary, reports, hands back.

## Paths & scripts (this command is an executable prompt)

Resolve plugin files from the plugin root via `${CLAUDE_PLUGIN_ROOT}`:
- hasher (read-only, run on entry and after apply):
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/hasher.mjs" <featureDir> --features-root <featuresRoot>`.
- manifest projector (the ONLY writer of `feature.lock.json`):
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/build-manifest.mjs" <featureDir> [--add-kind K | --history-summary S] [--features-root <dir>]`.
- state/verdict applier (the ONLY writer of `state.json`):
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/apply.mjs" <readiness-spec|reconcile> <featureDir> …`.
- ship recorder: `node "${CLAUDE_PLUGIN_ROOT}/scripts/record-impl.mjs" ship <featureDir> --task <T-…> --deliver <EL=sha256:…>`.
- projections: `node "${CLAUDE_PLUGIN_ROOT}/scripts/project-maps.mjs" <featureDir>`.
- migration: `node "${CLAUDE_PLUGIN_ROOT}/scripts/migrate.mjs" <featureDir> [--dry-run]`.
- schema check: `loadAndValidate('<file>','${CLAUDE_PLUGIN_ROOT}/schemas/<name>.schema.json')`
  from `${CLAUDE_PLUGIN_ROOT}/scripts/lib/validate.mjs`.

These paths resolve inside the loaded plugin (installed or `--plugin-dir`). A referenced file
missing after **one** direct check ⇒ STOP and report a broken fd installation — never search
the repo or `$HOME` for plugin files.

**Script contract (applies to every shipped script):**
- Scripts are EXECUTED via the one-liners above — their stdout JSON is the whole
  interface. Never `Read` a script's `.mjs` source into context; running one with wrong or
  missing args prints a usage error, and that error is the documentation.
- Reading a script's source is allowed only to diagnose an execution that already failed —
  say so explicitly when you do.
- Never re-implement a shipped script inline (hand-assembled state JSON, one-off replacement
  scripts). A job no shipped script covers is a gap: report it, do not work around it.

Judge staleness against **fresh hasher output**, never stored `state.json` fields. Write JSON
pretty (2-space) + trailing newline, validate against schema before proceeding. HIL uses
`AskUserQuestion` in this main thread only.

## Preconditions (gates)

1. **Config** — read `.claude/fd-config.json`; missing / unparsable / fails
   `fd-config.schema.json` → **halt** "run `/fd:config`" and STOP.
2. **Feature selection** — resolve the target (never infer from a previous session): explicit
   `$0` slug → use it; else exactly one feature dir under `<featuresRoot>` → use it; else match
   `state.json.branch` against the current git branch; else **HIL** with the list.
3. **Artifacts exist** — the feature has `spec.md` + `feature.lock.json`; otherwise there is
   nothing to grill (direct the user to `/fd:start` or `/fd:from-docs`).
4. **Schema** — a workspace artifact with a **lower** `schema` → `migrate.mjs --dry-run`, HIL,
   apply (backup first); **higher** `schema` → hard halt "workspace requires a newer fd plugin".
5. **Completed-implementation guard** — run the hasher; if **every** task is `implemented` /
   `shipped`, **block**: requirement changes after a finished implementation belong to a **new
   feature** (forward-only), not a re-grill.
6. **Cold start** — load `spec.md`, `feature.lock.json`, `state.json` on demand from disk.

## Flow

1. **Entry reconcile — detect.** Run the hasher and diff fresh element hashes against the
   manifest (this also catches manual `spec.md` edits made outside the commands).
   - **Ship-detection.** For each `implemented` task, test whether its `impl.commits` are
     reachable from `prs.baseBranch` (`git merge-base --is-ancestor`). Reachable → flip via
     `node "${CLAUDE_PLUGIN_ROOT}/scripts/record-impl.mjs" ship <featureDir> --task <T-…,…> --deliver <EL=sha256:…,…>`
     (the script flips `implemented → shipped`, marks the elements `delivered`, and sets
     `state.json.phase = "shipped"` once every live task is shipped). Unreachable but a
     `git cherry` / `git patch-id` match against `baseBranch` → suspected squash-merge →
     **one batched HIL** confirming many tasks at once (regular under a "squash and merge"
     repo policy). These flips synchronize with git; they do not touch `inputHash` or DoR verdicts.
   - If the feature consumes upstream specs, re-read their manifests and compare consumed-element
     hashes — load `${CLAUDE_PLUGIN_ROOT}/references/CROSS_FEATURE.md` only then, never otherwise.
2. **Grill (main thread).** Load and follow `${CLAUDE_PLUGIN_ROOT}/references/GRILLING.md` + `${CLAUDE_PLUGIN_ROOT}/references/BUILDING_SPEC.md`.
   Drill around the user's input; changes materialize as new / filled-in element blocks. The
   grill is **ID-aware**: keep existing IDs exactly, allocate new IDs only for genuinely new
   elements, never renumber or reuse. Maintain `CONTEXT.md`/ADRs (routed per `storage.docs` when
   set, else per storage mode); ground new external claims on-demand via the `researcher`
   subagent, appending to `sources-map.json`.
3. **Reconcile-plan (HIL, before apply).** Re-hash, then diff the changed spec against the
   manifest: added / removed / `modified` / unchanged per element. Classify `modified`
   **breaking / non-breaking conservatively** — any contract modification is breaking unless
   provably additive; a human may override. Map changed elements → tasks → actions
   (regen-in-place / drop / none), propagating along the SC graph via `inputHash`. **Changing
   or removing a `delivered` element → block**: it is out of scope and belongs to a new feature.
   Show the plan and get approval before writing anything.
4. **Apply (scope = `/fd:grill`).** Write `spec.md`; project the manifest:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/build-manifest.mjs" <featureDir> --history-summary "<one-line delta summary>" --features-root <featuresRoot>`
   (element hashes, history append, `spec.hash` bump; existing task entries keep their stored
   hashes — the staleness baseline). Then execute the approved plan:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/apply.mjs" reconcile <featureDir> --plan-file <scratch>/reconcile.json`
   — `{ stale: [<affected/consumer T-…>], bumpVersions: [<delivered EL with a HIL-approved
   breaking change>], drop: [] }`; the `@v` bump lives ONLY behind that approved plan. **Tasks
   are marked `stale` in the manifest only — do not rewrite task files** (full task apply is
   `/fd:to-tasks`). Run `project-maps.mjs` to recompute `ac-map.json`. (`state.json.specHash`
   is set by the re-validation tail's `readiness-spec` apply.)

## Re-validation tail (spec DoR — `block → verdict`)

1. Read `validation.dimensions.spec`; full v1 set `structural`, `coverage`, `grounding`,
   `feasibility`, `decomposability`, `non-over-spec` (semantics: `${CLAUDE_PLUGIN_ROOT}/references/BUILDING_SPEC.md`).
2. Fan out **one `validator` per configured dimension** (parallel — dispatch them ALL in ONE
   message, multiple Agent calls in a single response; one-per-message serializes the fan-out.
   Await their completions directly, never `sleep`/poll), each with dimension name + feature
   dir + check semantics; each returns `{dimension, checks:[{id, verdict, evidence}],
   blockingDoubts:[], advisoryDoubts:[]}`. The `grounding` validator may spawn nested
   `researcher` subagents.
3. Aggregate every `fail` into `failedChecks`.
4. Ask each **blocking** doubt here via `AskUserQuestion` (an answer is required before a
   verdict); fold the answers/fixes into the spec and re-hash. **Advisory** doubts are reported
   to the human but never force a re-run. Re-run **only** the dimensions whose in-scope elements
   changed since they last passed — not the whole set — and add no speculative confirm round
   after a fix the model already justified.
5. Waivers (only if `validation.allowWaiver`; the model never waives): a human may waive each
   remaining fail. Before overwriting the prior `readiness.spec`, compare its `waivedChecks` to
   the new fails — same `checkId` still failing → show the prior waiver, ask **one** renew
   confirmation, log `{ id, by:"human", at:<ISO> }`, move it into `waivedChecks`.
6. `verdict = ready` iff `failedChecks` empty (after waivers), else `blocked`. Write the
   verdict content `{ verdict, dimensionsRun, failedChecks, waivedChecks }` to a scratchpad
   file and apply it:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/apply.mjs" readiness-spec <featureDir> --verdict-file <scratch>/verdict-spec.json --features-root <featuresRoot>`
   — the script records `state.json.readiness.spec` (injecting `validatedHash` = the fresh
   `specHash` it computes itself) and sets `state.json.specHash`. Changing the spec bumps
   affected tasks' `inputHash` → moves `tasksHash` → the tasks verdict also goes stale, so
   `/fd:implement` won't act on a stale set until `/fd:to-tasks` re-projects.

## Output / checkpoint

Report: what changed (the element diff — added / removed / modified, breaking vs non-breaking),
which tasks are now `stale`, any ship-detection flips, and the new DoR verdict with
`dimensionsRun` against the full v1 set. Then a **one-line prose** next-step suggestion —
usually `/fd:to-tasks` to re-project the tasks — and **stop**. Do not offer to run it; never
invoke an fd command via the Skill tool.

## Edge cases

- **Manual spec edit before grill** — caught by the entry reconcile (fresh hash ≠ manifest);
  it flows through the reconcile-plan like any change.
- **No actual change after grilling** — the diff is empty; still re-run the validation tail so
  the verdict is bound to the current hash, and report "no element changes".
- **Unknown `KIND` from the hasher** — HIL (accept new `KIND` → `idCounters`, or fix the typo)
  before the reconcile-plan.
- **Suspected squash-merge** — one batched HIL in ship-detection, not per-task, and not a blind
  flip.
- **Delivered element in the change set** — hard block; the change belongs to a new feature.
