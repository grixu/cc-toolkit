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

Resolve plugin files from the commands dir via `${CLAUDE_SKILL_DIR}`:
- hasher (read-only, run on entry and after apply):
  `node "${CLAUDE_SKILL_DIR}/../scripts/hasher.mjs" <featureDir> --features-root <featuresRoot>`.
- projections: `node "${CLAUDE_SKILL_DIR}/../scripts/project-maps.mjs" <featureDir>`.
- migration: `node "${CLAUDE_SKILL_DIR}/../scripts/migrate.mjs" <featureDir> [--dry-run]`.
- schema check: `loadAndValidate('<file>','${CLAUDE_SKILL_DIR}/../schemas/<name>.schema.json')`
  from `${CLAUDE_SKILL_DIR}/../scripts/lib/validate.mjs`.

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
     reachable from `prs.baseBranch` (`git merge-base --is-ancestor`). Reachable → flip the
     task `implemented → shipped` and its produced elements `pending → delivered` (+ set
     `deliveredHash`). Unreachable but a `git cherry` / `git patch-id` match against
     `baseBranch` → suspected squash-merge → **one batched HIL** confirming many tasks at once
     (regular under a "squash and merge" repo policy). These flips synchronize with git; they
     do not touch `inputHash` or DoR verdicts. If after the flips **every**
     task in the manifest is `shipped`, set `state.json.phase = "shipped"`.
   - If the feature consumes upstream specs, re-read their manifests and compare consumed-element
     hashes (`${CLAUDE_SKILL_DIR}/../references/CROSS_FEATURE.md`).
2. **Grill (main thread).** Load and follow `${CLAUDE_SKILL_DIR}/../references/GRILLING.md` + `${CLAUDE_SKILL_DIR}/../references/BUILDING_SPEC.md`.
   Drill around the user's input; changes materialize as new / filled-in element blocks. The
   grill is **ID-aware**: keep existing IDs exactly, allocate new IDs only for genuinely new
   elements, never renumber or reuse. Maintain `CONTEXT.md`/ADRs (routed per storage mode);
   ground new external claims on-demand via the `researcher` subagent, appending to
   `sources-map.json`.
3. **Reconcile-plan (HIL, before apply).** Re-hash, then diff the changed spec against the
   manifest: added / removed / `modified` / unchanged per element. Classify `modified`
   **breaking / non-breaking conservatively** — any contract modification is breaking unless
   provably additive; a human may override. Map changed elements → tasks → actions
   (regen-in-place / drop / none), propagating along the SC graph via `inputHash`. **Changing
   or removing a `delivered` element → block**: it is out of scope and belongs to a new feature.
   Show the plan and get approval before writing anything.
4. **Apply (scope = `/fd:grill`).** Write `spec.md`; update `feature.lock.json`: element
   hashes, append a `history` entry `{ hash, at:<ISO>, summary }`, bump `spec.hash`. A
   **breaking change to a delivered element** bumps its `@v` (`version`) and sets its consumers
   `stale`. Set `state.json.specHash`. **Mark affected tasks `stale` in the manifest only —
   do not rewrite task files** (full task apply is `/fd:to-tasks`). Run `project-maps.mjs` to
   recompute `ac-map.json`. Validate every written artifact against its schema.

## Re-validation tail (spec DoR — `block → verdict`)

1. Read `validation.dimensions.spec`; full v1 set `structural`, `coverage`, `grounding`,
   `feasibility`, `decomposability`, `non-over-spec` (semantics: `${CLAUDE_SKILL_DIR}/../references/BUILDING_SPEC.md`).
2. Fan out **one `validator` per configured dimension** (parallel), each with dimension name +
   feature dir + check semantics; each returns `{dimension, checks:[{id, verdict, evidence}],
   doubts:[]}`. The `grounding` validator may spawn nested `researcher` subagents.
3. Aggregate every `fail` into `failedChecks`.
4. Ask returned `doubts` here via `AskUserQuestion`; fold answers into the spec, re-hash and
   re-run the affected dimension.
5. Waivers (only if `validation.allowWaiver`; the model never waives): a human may waive each
   remaining fail. Before overwriting the prior `readiness.spec`, compare its `waivedChecks` to
   the new fails — same `checkId` still failing → show the prior waiver, ask **one** renew
   confirmation, log `{ id, by:"human", at:<ISO> }`, move it into `waivedChecks`.
6. `verdict = ready` iff `failedChecks` empty (after waivers), else `blocked`. Write
   `state.json.readiness.spec = { verdict, validatedHash:<fresh specHash>, dimensionsRun, failedChecks, waivedChecks }`; validate `state.json`. Changing the spec bumps affected tasks'
   `inputHash` → moves `tasksHash` → the tasks verdict also goes stale, so `/fd:implement`
   won't act on a stale set until `/fd:to-tasks` re-projects.

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
