---
description: Implement all ready tasks of a feature in dependency waves on a feature branch, validating each by AC + CI + code review. User-run only.
argument-hint: "[slug]"
disable-model-invocation: true
---

Implement every ready task of one feature, wave by wave, on its feature branch — each task
in an isolated worktree, squash-merged serially, gated by AC + full CI + code review, with a
self-healing repair loop. Runs autonomously between human gates; hands control back at the end.

`$0` (optional) = feature slug. Cold-start: read everything from disk, rely on nothing from a
prior command. `${CLAUDE_SKILL_DIR}` points at `commands/`; reach sibling dirs via `../`.

---

## Preconditions (run in this order; each is a hard gate)

1. **Config.** Read `.claude/fd-config.json`. Missing, unparsable, or `schema` mismatch → STOP:
   "run `/fd:config`". Keep `storage.featuresRoot` (or `storage.shared.specsRoot`),
   `prs.baseBranch`, `implement.*`, `codeReview.skills`, `tooling.*` for later steps.

2. **Feature selection.** Resolve the feature directory (holds `spec.md`, `state.json`,
   `feature.lock.json`, `sc-map.json`, `tasks/`):
   - `$0` given → use `<featuresRoot>/$0`.
   - else exactly one feature dir under `featuresRoot` → use it.
   - else match `state.json.branch` against the current git branch → use that feature.
   - else **HIL**: `AskUserQuestion` listing feature slugs; user picks one.

3. **Schema migration.** Run `node "${CLAUDE_SKILL_DIR}/../scripts/migrate.mjs" <featureDir> --dry-run`.
   Lower artifact `schema` → show the change report → **HIL** confirm → run without `--dry-run`
   (writes `.bak-schema<N>` backups). Higher `schema` → STOP: "workspace needs a newer `fd` —
   update the plugin".

4. **Reconcile — DETECT ONLY.** Run the hasher on every entry; judge staleness *only* against
   its fresh output — never against stored `state.json` fields (they may themselves be stale):
   `node "${CLAUDE_SKILL_DIR}/../scripts/hasher.mjs" <featureDir> --features-root <featuresRoot>`
   → `{ elements, specHash, unknownKinds, tasks:{ T:{inputHash,contentHash} }, tasksHash }`.
   `/fd:implement` applies **nothing** to tasks or spec (reconcile steps 7–8 are skipped).
   - **Ship-detection (reconcile step 1 — git-reality sync, allowed; main thread writes the
     manifest).** For each `implemented` task, test each `impl.commits` SHA with
     `git merge-base --is-ancestor <sha> <baseBranch>`. All reachable → flip task
     `implemented → shipped` and its produced elements `pending → delivered`
     (`deliveredHash` = current element hash, `status: delivered`). Unreachable but
     `git patch-id` / `git cherry` matches `baseBranch` history → suspected squash-merge →
     **one batched HIL** (a single confirmation covers many tasks — regular under a "squash and
     merge" repo policy, not an exception). This flip touches neither `inputHash` nor DoR verdicts. If after the flips
     **every** task in the manifest is `shipped`, set `state.json.phase = "shipped"`.
   - **Drift-detection (BLOCK).** Compare the fresh `elements` map (`{id → hash}`) against `manifest.elements[id].hash`
     (added / removed / modified) AND fresh `tasks[id].inputHash` / `tasks[id].contentHash` against the
     manifest. Any spec drift, any task `inputHash` drift, or a `contentHash` mismatch (a
     hand-edited generated-only task file) → **HARD BLOCK**: "spec/tasks drifted — run `/fd:to-tasks`".
     Also verify `sc-map.json` freshness: `node "${CLAUDE_SKILL_DIR}/../scripts/project-maps.mjs" <featureDir> --check`
     — `generatedFrom.tasksHash` ≠ fresh `tasksHash` → same block.

5. **DoR-tasks enforcement (BLOCK).** Read `state.json.readiness.tasks`. Proceed only if
   `verdict == "ready"` AND `validatedHash == tasksHash` (fresh). Otherwise refuse and point to
   `/fd:grill` (change requirements) or `/fd:to-tasks` (regenerate + revalidate). Never re-validate silently.

6. **Cross-feature upstream delivered (BLOCK; live).** For every task `consumes` ref of the
   cross-feature form `<slug>#<EL>@vN` (the `#` marks feature scope; intra `T-…::EL@vN` are
   local, skip them): read Y's manifest at `<featuresRoot>/<slug>/feature.lock.json` **live** and
   confirm `EL` is delivered — either `elements[EL].status == "delivered"`, or, since Y's manifest
   may be stale, recompute delivered read-only (Y's producer-task `impl.commits` reachable from
   `baseBranch`). Ambiguous (unreachable but patch-id suggests squash-merge) → **HIL**, not a blind
   block. Not delivered / missing / dangling ref → **BLOCK** naming exactly which `<slug>#<EL>@vN`
   are unmet; advise "build Y (or at least `EL`) first" (order advice is element-precise).

7. **Feature branch.** `state.json.branch` set → `git checkout` it. Null (first run) → create the
   branch from `implement.branchTemplate` (default `feat/{slug}`, `{slug}` substituted) off
   `prs.baseBranch`, check it out, and write `state.json.branch` (schema-validated, 2-space JSON).

8. **Recovery.** `state.json.waveInProgress == true` on entry ⇒ a Workflow run never survives a
   session exit, so **cold-restart**: delete any leftover task worktrees (recovery cleanup is
   always), then re-run that wave as a **new run** from disk state (manifest statuses + `sc-map.json`)
   — do not attempt to resume the old run.

---

## Engine — waves computed on the fly; the goal lives in this conversation

Waves are **topological layers of `sc-map.json`**, computed on the fly (`from` = consumer,
`to` = producer; a task enters the earliest wave in which all its intra-feature producers have
completed). There is **no materialized execution plan** — the SC map is the only plan.

The "goal" is this command's own main-conversation logic, **not** a platform primitive. A Workflow
run takes no user input mid-run, so **each wave and each repair iteration = one separate run**.
Per wave: launch ONE run → evaluate its structured results → decide next wave / repair wave /
checkpoint. All HIL gates live **between runs, in this main thread**.

- **Run engine.** Dynamic Workflow when available (availability detected by `/fd:config`,
  re-verified on entry). Unavailable, or `implement.engine == "subagents"` → **degrade** to
  parallel Agent-tool subagents with per-task worktree isolation; gates and state are identical.
  Report the degradation; do not block on it.
- **State ownership.** Set `state.json.phase = "implementing"` at the first wave start. Set
  `waveInProgress = true` for the duration of a run, `false` once the wave closes. The manifest
  (`feature.lock.json`: statuses, `impl.commits`, `impl.ci`, `impl.cr`) is written **exclusively by
  this main conversation** from the run's structured results — single writer, never by wave subagents.

**Task state machine** (this command owns two transitions):

```
ready ──(wave start)──▶ in-progress ──(task gates green)──▶ implemented ──(ship-detect)──▶ shipped
                             └──(failure)──▶ stays out of implemented until repaired or escalated
```

A task enters as `ready` (set by `/fd:to-tasks`). This command's goal sets `in-progress` at wave
start and `implemented` only after the task's gates are green. `shipped` is set by nobody directly —
only ship-detection (precondition 4) flips it once `impl.commits` are reachable from `baseBranch`.

---

## Wave mechanics

- **Isolation.** One git worktree per task. Bootstrap each fresh worktree with the
  `implement.worktreeSetup` commands (e.g. `pnpm install`) before the task starts.
- **Footprint serialization.** Before a wave starts, estimate each task's file footprint
  (`codeDeps` + files named in the task body, best-effort). Tasks with overlapping footprints
  **serialize within the wave** (the next starts from the feature branch *after* the previous
  merged); disjoint tasks run in parallel. This is a heuristic — the merge gate catches whatever slips.
- **Task work.** Each task agent commits **atomically, piece by piece** in its worktree, with
  decision rationale in the commit messages. The main thread sets the task `in-progress` at wave
  start and `implemented` only after its gates are green.

---

## Gates

**Per task, before merge (block).** Validate the ACs **covered entirely by this task** + lint the
**changed / created files only**. ACs spanning more than one task are not verifiable here — they wait
for the wave gate. Pass → eligible to merge.

**Merge = squash (serial).** The **merger** subagent squash-merges each passing task's worktree
branch into the feature branch as exactly **one commit**, trailer `Task: <id>`, decision rationale
from the worktree's piece-commit messages gathered into the body. Piece commits stay in the worktree.
Merges run **strictly serially** through the merger — zero branch races. The merger returns per-task
`{task, commit SHA | conflict diagnosis}`; this main thread records `impl.commits`.

**Per wave, after all merges (block).** Run full **CI** (`tooling.lint` + `tooling.test` +
`tooling.build`) on the feature branch + validate the **ACs closed by this wave** (those whose last
producer task just merged; a multi-wave AC closes in the wave of its last producer).

**Post-CI code review (gate — feeds repairs, not a hard stop).** The CR agent inside the run invokes
each skill in `codeReview.skills` **by name via the Skill tool** (≥1). Findings feed the repair loop.

**Worktree cleanup.** Per `implement.worktreeCleanup` (`always` | `keep-failed`); recovery cleanup
is always.

---

## Repair loop

On any failure (per-task AC, merge conflict, wave CI, or CR finding) the validating agent returns a
**structured diagnosis**: cause, location, and the context needed to understand it. The next iteration
is a **separate run** containing **only repair tasks**:

- Repair tasks are **ephemeral** — not SC nodes, no new element IDs; each references its original task,
  its input is `original task + diagnosis`. They exist only inside `/fd:implement`.
- A repair lands as `git commit --fixup` of its task's commit. At wave close, `git rebase --autosquash`
  pulls fixups into the original commit — the final tree is identical, so the wave CI verdict stays
  valid. Autosquash conflict → keep the repair as a separate commit carrying the same `Task: <id>`
  trailer (`/fd:to-prs` then partitions all commits with that trailer together).
- After **K = `implement.maxRepairIterations`** failed iterations on the same task → **HIL escalation**;
  report the unresolvable task. Never loop forever.

---

## Boundaries

- **Spec freeze during a wave.** While `waveInProgress`, the spec is frozen. Requirement changes land
  in `spec.md` as ordinary edits and are picked up by the **next** `/fd:to-tasks` (re-entry drift
  detection will block until then) — never by the running wave.
- **Mutability.** Earlier waves' code is mutable via repair tasks **within this run**. Once **all**
  tasks are `implemented` / `shipped`, the grill → to-tasks → implement path is **closed** for this
  feature (forward-only); further change is a new feature.
- **Degenerate.** 1 task → 1 wave, 1 worktree, zero parallelism — same engine and same gates.

---

## Gate table

| Gate | Where | Type |
|---|---|---|
| Missing / invalid config | entry | block |
| Schema migration (lower → apply; higher → halt) | entry | HIL / block |
| Feature selection (>1, no match) | entry | HIL |
| Ambiguous ship (e.g. squash-merge) | entry, reconcile step 1 | HIL |
| Spec / task drift in detection (no apply) | entry | block |
| DoR-tasks enforcement + upstream `delivered` | entry | block |
| Ambiguous upstream `delivered` (squash-merge) | entry, cross-feature | HIL |
| Per-task AC (covered entirely) + lint of changes before merge | wave | block |
| Per-wave full CI (lint + test + build) + AC closed by wave | wave | block |
| Post-CI code review (≥1 skill) | wave | gate |
| K-iteration repair failure — escalation | repair loop | HIL |

---

## Output / checkpoint

Report: tasks implemented (with `Task: <id>` commit SHAs), per-wave CI + CR results, any HIL
escalations, and whether the run degraded to subagents. The feature branch now holds the whole
feature as a linear, one-commit-per-task history. Suggest as prose (do **not** run it): self-review
the feature branch, then `/fd:to-prs`.

---

## Edge cases

- **Unknown KIND in spec** (`hasher` `unknownKinds` non-empty) surfaces as spec drift handling in
  `/fd:to-tasks`, not here — it means the spec is not in a clean, tasked state → block to `/fd:to-tasks`.
- **No `sc-map.json` / manifest** → the feature was never tasked → the reconcile-detect sc-map check blocks first (both routes point to `/fd:to-tasks`).
- **Merge conflict the merger cannot resolve mechanically** → returned as a diagnosis → repair loop,
  not a guess.
- **Session exits mid-wave** → next invocation hits the recovery precondition (cold restart).
