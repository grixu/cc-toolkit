---
description: Implement all ready tasks of a feature in dependency waves on a feature branch — AC + scoped CI per wave, one whole-feature code review at feature close. User-run only.
argument-hint: "[slug]"
disable-model-invocation: true
---

Implement every ready task of one feature, wave by wave, on its feature branch — each task
in an isolated worktree, squash-merged serially, gated per wave by AC + scoped CI, with one
whole-feature code review at feature close and a self-healing repair loop. Runs autonomously
between human gates; hands control back at the end. **Resumable:** an interrupted session
resumes the remainder of the in-flight wave, salvaging completed-but-unmerged task branches.

`$0` (optional) = feature slug. Cold-start: read everything from disk, rely on nothing from a
prior command. Plugin files (`scripts/`, `schemas/`, `references/`) resolve via
`${CLAUDE_PLUGIN_ROOT}`; a file missing after **one** direct check ⇒ STOP and report a broken
fd installation — never search the repo or `$HOME` for plugin files, and do not read script
sources (use the documented one-liners).

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

3. **Schema migration.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/migrate.mjs" <featureDir> --dry-run`.
   Lower artifact `schema` → show the change report → **HIL** confirm → run without `--dry-run`
   (writes `.bak-schema<N>` backups). Higher `schema` → STOP: "workspace needs a newer `fd` —
   update the plugin".

4. **Reconcile — DETECT ONLY.** Run the hasher on every entry; judge staleness *only* against
   its fresh output — never against stored `state.json` fields (they may themselves be stale):
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/hasher.mjs" <featureDir> --features-root <featuresRoot>`
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
     Also verify `sc-map.json` freshness: `node "${CLAUDE_PLUGIN_ROOT}/scripts/project-maps.mjs" <featureDir> --check`
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

7. **Feature branch (first run: adopt a prepared branch, else base-branch HIL).** `state.json.branch`
   set → `git checkout` it. Null (first run) → first try **adoption, with no question asked**: when the
   user is already sitting on a branch they prepared for this work, use it as the feature branch as-is.
   Adopt when ALL hold:
   - `git rev-parse --abbrev-ref HEAD` is a branch (not `HEAD`/detached) and differs from `prs.baseBranch`;
   - the branch is cut from the base and up to date with it: `git merge-base --is-ancestor <prs.baseBranch> HEAD`;
   - the branch is not recorded as `state.json.branch` of another feature under `featuresRoot`.
   Adoption = write the current branch name to `state.json.branch` (schema-validated, 2-space JSON);
   create nothing, ask nothing; the checkpoint report says "branch adopted" instead of "created".
   Otherwise (sitting on the base itself, detached HEAD, branch behind the base, or the guard failed) →
   **HIL** with `AskUserQuestion` "create `<branchTemplate>` off which base?" (branch name from
   `implement.branchTemplate`, default `feat/{slug}`, `{slug}` substituted). Options: `prs.baseBranch`
   (default / recommended); the current git branch (only when it differs from `prs.baseBranch`); or
   another ref (validate with `git rev-parse --verify <ref>` — reject and re-ask on failure). Create the
   branch off the **chosen** base, check it out, and write `state.json.branch`. The HIL runs on a
   feature's first `/fd:implement` unless a prepared branch was adopted.

8. **Recovery — resume the remainder + salvage.** `state.json.waveInProgress == true` on entry ⇒ a prior
   session was interrupted mid-wave. A Workflow run never survives a session exit, so do **not** resume the
   old run (ignore Workflow `resumeFromRunId`) — reconstruct from disk + git:
   - **(a) Done set.** A task is done when it is `implemented` **and** all its `impl.commits` are reachable
     from the feature tip (`git merge-base --is-ancestor <sha> <feature>`). Skip these — already merged and recorded.
   - **(b) Salvage set.** Discover leftover task branches (`git worktree list --porcelain`, then the
     `fd/<slug>/T-*` branch pattern) for tasks **not** done. For each, first re-resolve its commits from
     trailers. A branch carrying an `Fd-Gate: pass` breadcrumb → **re-run the cheap per-task gate** (the ACs
     covered entirely by that task + lint of its changed files). Gate pass ⇒ the **merger** merges it and this
     main thread **records it incrementally** (report it as salvaged). Gate fail, or **no breadcrumb** ⇒ **discard**.
   - **(c) Worktree cleanup.** Delete worktrees **only** for non-salvaged tasks; a salvaged task's worktree
     survives until its merge lands.
   - **(d) Recompute + run the remainder.** Recompute waves from the updated manifest + `sc-map.json` and run
     only the outstanding tasks. If **every** task is `implemented` but `impl.cr` is not `pass` on all → there is
     no wave to run: resume at **Feature close** (its code-review step).

---

## Engine — waves computed on the fly; the goal lives in this conversation

Waves are **topological layers of `sc-map.json`**, computed on the fly (`from` = consumer,
`to` = producer; a task enters the earliest wave in which all its intra-feature producers have
completed). There is **no materialized execution plan** — the SC map is the only plan.

The "goal" is this command's own main-conversation logic, **not** a platform primitive. A Workflow
run takes no user input mid-run, so **each wave and each repair iteration = one separate run**.
Per wave: launch ONE run → merge, record, and gate its results here in the main thread → decide next
wave / repair wave / feature close. All HIL gates live **between runs, in this main thread**.

**Run boundary.** A wave run does **only** task implementation + each task's self-gate + a durable
breadcrumb commit. Everything else — the serial merge, the per-task manifest writes, the scoped CI,
and (at feature close) the code review — is done by **this main thread**, between runs.

- **Run engine.** The wave run executes the **shipped** script
  `${CLAUDE_PLUGIN_ROOT}/scripts/wave-implement.mjs` via the **Workflow** tool (`scriptPath`) — a
  Claude-Code dynamic-workflow script that calls the harness `agent()`; **never invoke it with `node`**.
  Workflow availability is detected by `/fd:config` and re-verified on entry. Pass the wave as **one**
  `args` value — it may reach the script as a JSON string, which the script parses defensively:
  - **args:** `{ mode: "implement"|"repair", wave, featureBranch, tasks: [{ id, worktree, branch,
    taskFile, serializeAfter?, diagnosis? }], gate: { acIds, lintChanged: true } }`.
  - **returns:** `{ tasks: [{ id, status: "passed"|"failed", changedFiles, headSha, gate, diagnosis? }] }`.
- **Fallback** (no Workflow tool, or `implement.engine == "subagents"`) → degrade to parallel
  **Agent-tool** subagents with per-task worktree isolation — **same** args/return contract, **same**
  task-agent prompts, same gates and state. Report the degradation; do not block on it.
- **Orchestration rule.** Await the run's (or the subagents') completion **directly**. Never
  foreground-`sleep`, never poll the filesystem — the harness returns the structured results when the
  agents finish.

### Task-agent contract (single source of truth)

Every task agent — spawned by the shipped script or by the subagent fallback — follows the **same**
directives (the script embeds them verbatim; the fallback reuses them):

- The task file is **self-contained** — do not re-grep or rediscover paths, symbols, or contracts
  already named in its body or `codeDeps`. Read it once and trust it.
- **Batch edits**, then run typecheck + lint **once** at the end — never after every edit.
- **Stub, never recreate**, a missing dependency file: a peer task's producer owns it, so write a
  minimal, contract-satisfying stub only. Do not touch files this task does not own.
- Commit **atomically**, piece by piece, on the worktree branch, with decision rationale in each message.
- **Final act, after the self-gate passes:** one **empty breadcrumb commit** on the worktree branch
  with trailers `Task: <id>` + `Fd-Gate: pass` (a one-line gate summary in the body). Self-gate fails →
  write no breadcrumb; return `status: "failed"` with a diagnosis.

### State ownership — single writer, incremental per task

The manifest (`feature.lock.json`) and `state.json` are written **exclusively by this main
conversation** — never by wave agents — and **per task, at merge time**, not batched at wave close:

- Set `state.json.phase = "implementing"` at the first wave start; set `waveInProgress = true` there
  and clear it to `false` **only at feature close**.
- After each **merger** merge: write that task's `impl.commits` and flip its status to `implemented`.
- **Canonical commit identity is the `Task: <id>` trailer;** `impl.commits` is a derived cache. After
  **every** autosquash, re-resolve it from trailers (`git log <base>..<featureBranch>` reading
  `%(trailers:key=Task,valueonly)`); a trailer left on **more than one** commit (an autosquash conflict)
  stores **all** those SHAs in the task's array.
- Per-wave **scoped CI** writes `impl.ci`; the feature-close code review writes `impl.cr`.

**Task state machine** (this command owns two transitions):

```
ready ──(wave start)──▶ in-progress ──(self-gate + merge)──▶ implemented ──(ship-detect)──▶ shipped
                             └──(failure)──▶ stays out of implemented until repaired or escalated
```

A task enters as `ready` (set by `/fd:to-tasks`). This command sets `in-progress` at wave start and
`implemented` once its self-gate passes **and** the merger has landed its branch. `shipped` is set by
nobody directly — only ship-detection (precondition 4) flips it once `impl.commits` are reachable from
`baseBranch`.

---

## Wave mechanics

- **Isolation & naming.** One git worktree per task. Worktree path `<repo>/.fd-worktrees/<slug>/<T-id>`,
  branch `fd/<slug>/<T-id>` — both derive from the feature slug, never from the feature branch's own
  name (an adopted branch changes nothing here). Bootstrap each fresh worktree with the
  `implement.worktreeSetup` commands (e.g. `pnpm install`) before the task starts.
- **Footprint serialization.** Before a wave starts, two best-effort pre-passes over the wave's tasks
  (both from `codeDeps` + file paths named in each task body):
  - **write ∩ write** — two tasks that write the same file serialize.
  - **read-after-write** — a task whose `needs` (its `codeDeps` + import/file paths named in its body)
    intersect a peer's `willWrite` (file paths the peer names for the elements it produces), with **no**
    existing `consumes` edge between them, must **serialize after** that peer (encode as
    `tasks[].serializeAfter`) or **defer to the next wave** (where the peer is already merged).
  Serialized tasks run in later batches; disjoint tasks run in parallel. Honest caveat: the element→file
  mapping is body-parsed, best-effort — the **primary** guarantee is the stub rule plus the merge and CI
  gates, not this heuristic.
- **Task work.** Per the task-agent contract above: batch edits, self-gate, one breadcrumb commit. The
  main thread sets the task `in-progress` at wave start and `implemented` after its self-gate passes and
  the merger lands it.

---

## Gates

**Per task = the task agent's self-gate (breadcrumbed).** Inside the run, each task agent validates the
ACs **covered entirely by that task** + lints its **changed / created files only**, then writes the
`Fd-Gate: pass` breadcrumb. ACs spanning more than one task are not verifiable here — they wait for the
wave gate.

**Merge = squash (serial, recorded incrementally).** For each passing task, **in order**, this main
thread invokes the **merger** subagent (one task per call) to squash-merge its worktree branch into the
feature branch as exactly **one commit**, trailer `Task: <id>`, rationale gathered from the worktree's
piece-commits (the empty breadcrumb excluded). Merges run **strictly serially** — zero branch races.
After each merge, record that task's `impl.commits` and `status = implemented` **before** starting the next.

**Per wave, after all merges (block) = scoped CI.** Union the changed files of the commits merged this
wave (`git diff --name-only`), map them to workspace packages (`pnpm-workspace.yaml` /
`package.json#workspaces` / `turbo.json` — best-effort). Run the **filtered** `tooling.*` (e.g. a
`--filter` per detected package) **only** when the mapping is confidently detected; otherwise fall back
to the **full** `tooling.lint` + `tooling.test` + `tooling.build`. Validate the **ACs closed by this
wave** (those whose last producer task just merged; a multi-wave AC closes in the wave of its last
producer). Record `impl.ci`.

**Code review is not a per-wave gate** — it runs once over the whole feature at **Feature close** (below).

**Worktree cleanup.** Per `implement.worktreeCleanup` (`always` | `keep-failed`). On recovery the salvage
decision gates deletion: a salvaged task's worktree survives until its merge lands; non-salvaged task
worktrees are deleted.

---

## Repair loop

On any failure (per-task AC, merge conflict, wave CI, or a feature-close CR finding) the validating agent
returns a **structured diagnosis**: cause, location, and the context needed to understand it. The next
iteration is a **separate run** containing **only repair tasks**:

- Repair tasks are **ephemeral** — not SC nodes, no new element IDs; each references its original task,
  its input is `original task + diagnosis`. They exist only inside `/fd:implement`.
- A repair lands as `git commit --fixup` of its task's commit. At close, `git rebase --autosquash`
  pulls fixups into the original commit — the final tree is identical, so the CI verdict stays valid.
  Autosquash conflict → keep the repair as a separate commit carrying the same `Task: <id>` trailer
  (`/fd:to-prs` then partitions all commits with that trailer together).
- **After every autosquash, re-resolve `impl.commits` from trailers** (`git log <base>..<featureBranch>`
  reading `%(trailers:key=Task,valueonly)`): the SHAs change, so the manifest cache must be refreshed; a
  trailer left on more than one commit stores all those SHAs in the task's array.
- After **K = `implement.maxRepairIterations`** failed iterations on the same task → **HIL escalation**;
  report the unresolvable task. Never loop forever. K applies to the **feature-close** repair wave too.

---

## Feature close

Once **all** tasks are `implemented`, close the feature — once, in this main thread:

1. **Full-repo CI.** Run the full `tooling.lint` + `tooling.test` + `tooling.build` on the feature branch.
   Failure → a repair wave, then re-enter here.
2. **Whole-feature code review (gate).** Compute `git diff --name-only <base>...<feature>` and write it
   (with the diff) to a file; hand the CR agent that **file path** — the agent `Read`s it. **Never inline
   the diff** into the prompt. The CR agent invokes **each** `codeReview.skills` skill **by name via the
   Skill tool** (≥1). **No** nested fan-out and **no** network research. Findings feed the repair loop.
3. **Final repair wave** (if any findings) → `--fixup` commits → `git rebase --autosquash` → re-resolve
   `impl.commits` from trailers.
4. **Re-run full CI** to confirm the tree is still green after the fixups.
5. **Record & report.** Set every task's `impl.cr = pass`; set `waveInProgress = false`. `phase` **stays
   `implementing`** — flipping to `shipped` remains ship-detection's job (precondition 4), after the
   feature branch merges to `baseBranch`. Report the close.

**Resume:** entry finds **all** tasks `implemented` but `impl.cr` not `pass` on all ⇒ no wave to run —
enter Feature close at **step 2**.

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
| Base-branch selection (first run) | entry | HIL (skipped when a prepared branch is adopted) |
| Ambiguous ship (e.g. squash-merge) | entry, reconcile step 1 | HIL |
| Spec / task drift in detection (no apply) | entry | block |
| DoR-tasks enforcement + upstream `delivered` | entry | block |
| Ambiguous upstream `delivered` (squash-merge) | entry, cross-feature | HIL |
| Salvage gate re-check on recovery | entry | block (per task) |
| Per-task AC (covered entirely) + lint of changes = self-gate | wave | block |
| Per-wave CI — scoped (fallback full) + AC closed by wave | wave | block |
| K-iteration repair failure — escalation | repair loop | HIL |
| Feature-close full-repo CI | feature close | block |
| Feature-close whole-feature code review (≥1 skill) | feature close | gate |

---

## Output / checkpoint

Report: tasks implemented (with `Task: <id>` commit SHAs); per-wave CI with **whether it ran scoped or
fell back to full**; on a resumed session, which tasks were **salvaged** vs **re-run**; the feature-close
**full CI + code-review** results; any HIL escalations; and whether the run degraded to subagents. The
feature branch now holds the whole feature as a linear, one-commit-per-task history. Suggest as prose
(do **not** run it): self-review the feature branch, then `/fd:to-prs`.

---

## Edge cases

- **Unknown KIND in spec** (`hasher` `unknownKinds` non-empty) surfaces as spec drift handling in
  `/fd:to-tasks`, not here — it means the spec is not in a clean, tasked state → block to `/fd:to-tasks`.
- **No `sc-map.json` / manifest** → the feature was never tasked → the reconcile-detect sc-map check blocks first (both routes point to `/fd:to-tasks`).
- **Merge conflict the merger cannot resolve mechanically** → returned as a diagnosis → repair loop,
  not a guess.
- **Session exits mid-wave** → next invocation hits recovery (resume-remainder + salvage, precondition 8):
  - **before any merge** → no task is done; every breadcrumbed branch is re-gated, then salvaged or discarded.
  - **mid-merges** (some tasks recorded) → done tasks are skipped; the rest salvage.
  - **during an autosquash** → after the rebase, `impl.commits` is re-resolved from trailers before it is trusted.
  - **salvage-fail** (breadcrumb present but the re-gate fails, or no breadcrumb) → discard the branch and
    re-run the task.
- **Degraded engine** (no Workflow tool / `implement.engine == "subagents"`) → same contract and gates via
  Agent-tool subagents; the degradation is reported, not a block.
