---
description: Project a validated spec onto a set of self-contained tasks, compute the SC dependency map, and validate the result to a ready verdict. Re-running is a surgical reconcile, not a regeneration.
argument-hint: "[feature-slug]"
disable-model-invocation: true
---

# /fd:to-tasks

Partition the spec's elements into self-contained task files (one producer per element), compute the acyclic SC map, and validate the tasks to `ready`. This command is the **single owner of task-file writes**: `/fd:grill` only marks tasks stale, `/fd:implement` blocks on drift.

Plugin scripts: hasher `${CLAUDE_PLUGIN_ROOT}/scripts/hasher.mjs`, projections `${CLAUDE_PLUGIN_ROOT}/scripts/project-maps.mjs`, estimator `${CLAUDE_PLUGIN_ROOT}/scripts/estimate-tokens.mjs`, migration `${CLAUDE_PLUGIN_ROOT}/scripts/migrate.mjs`. Schemas in `${CLAUDE_PLUGIN_ROOT}/schemas/`. Validate every JSON write with `scripts/lib/validate.mjs` (see below). When tasks consume cross-feature contracts (upstream pins, `fd:copy` copies, `@v` semantics), load `${CLAUDE_PLUGIN_ROOT}/references/CROSS_FEATURE.md` for the authoritative contract before reconciling or copying.

## Preconditions

Run these gates in order; each cold-starts from the workspace — never trust context from a prior command.

1. **Config gate (block).** Read `.claude/fd-config.json`. Missing, unparsable, or `schema` mismatch → halt with "run `/fd:config`". Load `storage`, `tasks`, `validation` from it.
2. **Feature selection.** Optional `$0` slug → use it. Else exactly one feature under the features root → use it. Else match `state.json.branch` against the current git branch. Else present the list with AskUserQuestion (HIL). The features root is `storage.featuresRoot` (per-feature) or `storage.shared.specsRoot` (shared); the feature dir is `<root>/<slug>`.
3. **Migrate.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/migrate.mjs" <featureDir>`. A **lower** workspace schema → run `--dry-run`, show the report, get HIL confirmation, then apply. A **higher** schema → hard halt: "workspace requires a newer fd plugin".
4. **Hasher on entry.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/hasher.mjs" <featureDir> --features-root <featuresRoot-or-specsRoot>`. Its JSON (`elements`, `specHash`, `unknownKinds`, `tasks`, `tasksHash`) is the source of truth for this run. **Staleness is always judged against these fresh values, never against `state.json` fields.**
5. **DoR-spec enforcement (block).** Read `state.json.readiness.spec`. Proceed only if `verdict == "ready"` AND `validatedHash == the fresh specHash`. If `blocked`, or the verdict is stale (hash mismatch), **REFUSE**: report the reason and point to `/fd:grill`. Never silently re-validate the spec.

If the hasher reports `unknownKinds`, that is a spec structural-consistency issue owned by the grill/spec validation — refuse and point to `/fd:grill` rather than inventing a KIND.

## Reconcile (re-run)

Task identity is a deterministic key over the produced-element set (`identityKey`); a re-run is a reconcile, not a regeneration. Run the shared reconcile (detection is shared; `/fd:to-tasks` performs the **full apply**):

1. **Ship detection.** For `implemented` tasks, test reachability of `impl.commits` from `prs.baseBranch` (`git merge-base --is-ancestor`). Reachable → flip `implemented → shipped` and the produced elements `pending → delivered` (set `deliveredHash`). Unreachable but `git patch-id` matches `baseBranch` history → suspected squash-merge → **HIL, batched** (one decision confirms many tasks). This only syncs with git reality; it does not touch `inputHash` or DoR verdicts.
2. **Parse spec → element hashes → rollup** (from the hasher output).
3. **Diff against the manifest** — added / removed / modified / unchanged, per element.
4. **Classify `modified` breaking vs non-breaking** conservatively: a contract modification is breaking unless provably additive; override via HIL. Breaking on an already-delivered element bumps its `@v`.
5. **Map changed elements → tasks → actions:** regen-in-place / drop / none. Match desired↔existing by **maximal coverage**; preserve the existing task↔element assignment **unless the spec forces a split or merge → HIL**. A drop (element removed **and never delivered**) → delete the task file. **Change or removal of a `delivered` element → BLOCK**: it is out of scope for this feature and is closed by a new feature.
6. **Propagate along the DAG** via `inputHash` (surgical: only tasks that actually consume a moved element go stale).
7. **HIL — reconcile plan.** Show the full plan (ships, element diffs, per-task actions, `@v` bumps) and STOP for approval before any write.
8. **Apply (full).** Write/correct/drop task files and the manifest per the plan.

**Upstream-only drift.** A task that is stale **only** because a consumed cross-feature contract moved (its `fd:copy` block is out of date) is **not regenerated**. Spawn the `copy-refresher` subagent with the task list plus, per task, the `fd:copy` refs and the current upstream element content + hash; it swaps the marked blocks in place. Then re-run the hasher so the manifest's `contentHash`/`inputHash` refresh from the new content.

## Decomposition (fresh or regen)

Partition **all** spec elements into tasks — every element assigned to exactly one producer task. Two-layer hybrid:

- **Foundation tasks first** — elements with fan-out ≥ 2, or contract KINDs (DB, CFG, shared API, enums). Consumers depend on the versioned contract `@v`.
- **Vertical slices** — one per AC/behavior; merge ACs that share a cohesive element set. Any element produced by ≥ 2 slices is **hoisted to foundation** (one-producer rule).

Size cascade, applied to each candidate task in order:

1. **Cohesion seam** — elements that change together / share a module or path stay together.
2. **Context budget** — the assembled task file **plus copied dependencies** must be ≤ `tasks.maxContextTokens`. Measure by assembling the file and running `node "${CLAUDE_PLUGIN_ROOT}/scripts/estimate-tokens.mjs" <assembledFile> --chars-per-token <tasks.charsPerToken>`. Over budget → split along the cohesion seam. This plan-time estimate is re-measured on the real generated file after each wave (see Generation waves) — the measurement, not an eyeballed guess, is the gate.
3. **Hard limits** — `maxElements`, `maxAcceptanceCriteria` when non-null force a split regardless of budget.

Ambiguous cohesion → **bias to split** (smaller, more, easier to review and parallelize). A **single element over budget** that cannot be cut (one producer) → **HIL**: accept it as `oversized: true`, or push back to the spec to break the element up.

## Task file format

Each `tasks/T-<n>.md` is a Markdown file with frontmatter and a self-contained body.

Frontmatter:

```yaml
id: T-004                       # append-only T counter from idCounters.T — never reused, even after a drop
title: <concise human title>
produces: [DB-3]                # elements this task creates (one producer per element)
consumes: [T-002::API-2@v1, checkout#API-2@v2]   # intra T::EL@vN + cross-feature slug#EL@vN
covers: [AC-5, FR-2, NFR-1]
codeDeps: []                    # existing-project code the task depends on
builtAgainst: { specHash: "sha256:…", inputHash: "sha256:…" }
status: planned                 # planned at generation; set to ready by the validation tail
```

The file **MUST begin with `---` on line 1** (a leading BOM is tolerated; anything else before the `---` silently disables the frontmatter and voids `produces`/`consumes`/`covers`). Frontmatter is a **FLAT YAML subset**: top-level `key: value` with inline arrays/objects only — indented or nested YAML is ignored. `codeDeps` names **real, existing** repo paths, verified during generation (never guessed); the body embeds those concrete paths so no downstream agent has to re-discover them.

Body: **fully self-contained** — copy in every piece of spec/ADR/context content the task needs; make **no references out** to the spec, ADRs, or other docs. Copied cross-feature contract content is wrapped in `fd:copy` markers so upstream drift is machine-locatable and refreshed by the copy-refresher rather than triggering a full regen:

```markdown
<!-- fd:copy checkout#API-2@v2 sha256:… -->
…copied element content…
<!-- /fd:copy -->
```

## Generation waves

Generation waves are **not** implementation waves. Because the SC map is computed *after* the tasks, generation cannot be SC-topological (chicken-and-egg). Instead order by the decomposition layers: **foundation tasks first, then slices**, so consumers' `consumes` refs resolve to already-known producer IDs in one pass. Pre-assign the producer IDs for the whole plan before dispatching, so every batch's `consumes` refs resolve up front.

- Batch within a layer by context budget or a > 15-task threshold. Each batch is **one subagent** that writes its task files.
- **Dispatch all batches of a layer in ONE message** (parallel tool calls); the validator fan-out (validation tail) goes the same way. Launch the fan-out and await the subagents' completions directly — never foreground-`sleep`, never poll the filesystem for their outputs; read each task file once after its agent reports done.
- **Spec extracts, not the whole spec.** The main thread has already parsed every element, so for each batch it writes a **per-batch extract** to the scratchpad — only the elements plus the ADR/context blocks that batch's tasks need — and points the subagent at its extract. A generation subagent never re-reads the full `spec.md`.
- **Handoff carries no copyable section markers.** Never hand a batch a single file whose per-task sections are set off by markers the subagent might copy into a task file (e.g. `### T-004`): a stray delimiter above the frontmatter voids it (see the line-1 rule in Task file format). Give each task's frontmatter as its own file, or instruct explicitly — the first line of every task file is `---`, nothing before it.
- **codeDeps are verified, not guessed.** A batch may run **at most ONE** bounded code exploration (one Explore-style lookup) to resolve the real, existing repo paths its tasks depend on; share that result across the batch's tasks and embed the concrete target paths in each task body, so implement-stage agents never grep to rediscover them.
- **Post-wave size gate.** After a wave completes, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/estimate-tokens.mjs" <assembledFile> --chars-per-token <tasks.charsPerToken>` on **every** assembled task file. Any file over `tasks.maxContextTokens` → split along the cohesion seam (**HIL**). The plan-time budget estimate does not replace this measurement.
- A small feature degenerates to a single batch / single subagent.
- A **trivial spec** (one element / one AC) → **one task**, SC with no edges; validations still run normally (1:1 coverage), nothing is skipped.

## Projections and validation tail

1. **Projections.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/project-maps.mjs" <featureDir>` to write `sc-map.json` and `ac-map.json`. A `{"error":"cycle","cycle":[...]}` (non-zero exit) means a shared element is wrongly distributed → hoist it into its own foundation task and retry. The SC map is a projection; never author it by hand.
2. **SC intersection validation.** Check order is correct and all dependencies are satisfied. A **dead symbol** — an element produced but consumed by nothing — goes to **HIL**: confirm it is intentional (may be consumed externally) or fix the distribution.
3. **Task validation tail (block → verdict).** Fan out **one `validator` subagent per dimension** listed in `validation.dimensions.tasks` (v1 set: `frontmatter`, `self-contained`, `sc-integrity`, `coverage`) — dispatch them in one message and await their completions directly, never `sleep`/poll. Each dimension:
   - **frontmatter** — id, produced elements (with IDs), `task::element` deps, code deps, AC, FR/NFR all present.
   - **self-contained** — everything needed is copied in; no references to external documents. **Cheap pre-scan first:** grep each task file for reference-leak markers (`see spec`, `ADR-`, `§`, `refer to T-`, `patrz`); only flagged files get the full LLM read for the reference-leak check — unflagged files pass it by construction. The other self-containment checks (the content a task needs is actually present) still apply to every file.
   - **sc-integrity** — graph acyclic, order correct, dependencies satisfied, dead symbols handled (HIL above).
   - **coverage** — every AC covered by ≥ 1 task; no uncovered spec elements.

   Verdicts are **binary pass/fail**; every fail is a **blocker**. Validator subagents return pass/fail plus `blockingDoubts` (an answer is required before a verdict) and `advisoryDoubts` (reported to the human, never forcing a re-run) — they have no AskUserQuestion; the command asks all HIL (blocking doubts, waivers, dead symbols) in the main thread. After folding answers/fixes, re-run **only** the dimensions whose in-scope tasks changed since they last passed, with no speculative confirm round after a fix the model already justified. Only a human lifts a block, via a logged **waiver**. **Waiver replay:** before overwriting the verdict, compare the previous `waivedChecks` against the new fails; if the same `checkId` still fails, show the prior waiver and ask for a one-confirmation renewal (logged). No silent inheritance.

## Apply and state writes

On the validation tail:

- Write `state.json.readiness.tasks = { verdict, validatedHash: <fresh tasksHash>, dimensionsRun, failedChecks, waivedChecks }`.
- **On pass**, set every task status `planned → ready` — in **both** the manifest and the task frontmatter. (`in-progress` is set later by `/fd:implement`, not here.)
- The apply records per task, in the manifest, `contentHash` + `inputHash` + `specHash` (flat fields; `builtAgainst {specHash, inputHash}` lives only in the task frontmatter). Tasks are generated-only — the user reviews but never edits; `contentHash` lets downstream commands detect a hand-edit as drift.
- After the **first** successful apply, set `state.json.phase = "tasks"` and write `state.json.tasksHash` = the fresh rollup.

Validate every JSON write against its schema before finishing (`feature.lock.json`, `sc-map.json`, `ac-map.json`, `state.json`), 2-space JSON with a trailing newline:

```bash
node --input-type=module -e "import { loadAndValidate } from '${CLAUDE_PLUGIN_ROOT}/scripts/lib/validate.mjs'; const r = loadAndValidate(process.argv[1], process.argv[2]); if (!r.valid) { console.error(JSON.stringify(r.errors, null, 2)); process.exit(1); }" <file.json> <schema.json>
```

## Gates

| Gate | Type |
|---|---|
| Missing / invalid config | block |
| DoR-spec enforcement (readiness.spec ready + fresh) | block |
| Change/removal of a delivered element | block |
| Reconcile plan before apply (re-run) | HIL |
| Oversize task split / merge | HIL |
| Dead symbols (possible external consumption) | HIL |
| Task validation (DoR) — tail | block → verdict |

## Output / checkpoint

Report: task count, SC map summary (nodes/edges, layers), the `readiness.tasks` verdict (with `dimensionsRun` vs the full v1 set), and any oversize / dead-symbol decisions. End with a one-line prose suggestion of the next step — `/fd:implement` when the verdict is `ready`, or `/fd:grill` when the spec needs work. Suggest, never run. Then return control.

## Edge cases

- **No tasks yet after a refused precondition** — leave the workspace untouched; the hasher reports `tasksHash: null` until tasks exist.
- **Cycle that re-appears after hoisting** — surface it as an SC-integrity failure for HIL rather than looping indefinitely.
- **Reconcile with only ship flips** (no spec diff) — apply the status syncs, skip regeneration, and report.
- **Upstream cross-feature ref unresolvable** at hash time — the hasher errors; treat it as a feasibility problem to resolve in `/fd:grill`, not here.
