---
description: Implement all ready tasks of a feature in one full-cycle Workflow run — dependency waves, per-wave smoke + AC verification with a bounded repair loop, full CI and whole-feature code review at close. Interrupts only for critical decisions. User-run only.
argument-hint: "[slug]"
disable-model-invocation: true
---

Implement every ready task of one feature on its feature branch, in **one full-cycle engine
run**: waves computed from task dependencies, each task in an isolated worktree, passing
tasks squash-merged serially, every wave gated by a typecheck+build smoke plus AC
verification with a bounded repair loop, and — after the last wave — the feature's FIRST
full CI, the whole-feature code review, mechanical fixes, autosquash, and a final full CI,
all inside the same run. The run comes back to this conversation **only** when it is
done, when its internal budget forces a checkpoint (auto-relaunched, no question asked), or
when a decision genuinely needs a human. **Resumable:** an interrupted session reconstructs
progress from git trailers and relaunches the remainder. "One run" names that resumability
property — the cycle is logical, not a wall-clock guarantee: a large feature (dozens of
tasks, architectural escalations, session limits) realistically completes as a **series of
launches** with HIL between them, each picking up exactly where the trailers say the last
one stopped.

`$0` (optional) = feature slug. Cold-start: read everything from disk, rely on nothing from a
prior command. Plugin files (`scripts/`, `schemas/`, `references/`) resolve via
`${CLAUDE_PLUGIN_ROOT}`; a file missing after **one** direct check ⇒ STOP and report a broken
fd installation — never search the repo or `$HOME` for plugin files.

**Script contract (applies to every shipped script):**
- Scripts are EXECUTED via the documented one-liners — their stdout JSON is the whole
  interface. Never `Read` a script's `.mjs` source into context; running one with wrong or
  missing args prints a usage error, and that error is the documentation.
- Reading a script's source is allowed only to diagnose an execution that already failed —
  say so explicitly when you do.
- Never re-implement a shipped script inline (hand-assembled state JSON, one-off replacement
  scripts). A job no shipped script covers is a gap: report it, do not work around it.

---

## Preconditions (run in this order; each is a hard gate)

1. **Config.** Read `.claude/fd-config.json`. Missing, unparsable, or `schema` mismatch → STOP:
   "run `/fd:config`". Keep `storage.featuresRoot` (or `storage.shared.specsRoot`),
   `prs.baseBranch`, `implement.*`, `codeReview.skills`, `tooling.*` (incl. the nullable
   `tooling.typecheck` — it feeds the per-wave smoke) for later steps.

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
   → `{ elements, specHash, unknownKinds, malformedAnchors, tasks:{ T:{inputHash,contentHash} }, tasksHash }`.
   `/fd:implement` applies **nothing** to tasks or spec (reconcile steps 7–8 are skipped).
   - **Ship-detection (reconcile step 1 — git-reality sync, allowed).** For each `implemented`
     task, test each `impl.commits` SHA with `git merge-base --is-ancestor <sha> <baseBranch>`.
     All reachable → flip via the shipped script (never hand-edit JSON):
     `node "${CLAUDE_PLUGIN_ROOT}/scripts/record-impl.mjs" ship <featureDir> --task <T-4,T-7> --deliver <EL=sha256:…,…>`
     (`--deliver` = each produced element with its current hash; the script flips
     `implemented → shipped`, marks elements `delivered`, and sets `phase = "shipped"` when every
     live task is shipped). Unreachable but `git patch-id` / `git cherry` matches `baseBranch`
     history → suspected squash-merge → **one batched HIL** (a single confirmation covers many
     tasks — regular under a "squash and merge" repo policy, not an exception). This flip touches
     neither `inputHash` nor DoR verdicts.
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

7. **Feature branch (first run: adopt a freshly cut branch, else HIL).** `state.json.branch`
   set → `git checkout` it. Null (first run) → first try **adoption, with no question asked**: when
   the user is already sitting on a branch they freshly cut for this work, use it as the feature
   branch as-is. Adopt silently when ALL hold:
   - `git rev-parse --abbrev-ref HEAD` is a branch (not `HEAD`/detached) and differs from `prs.baseBranch`;
   - the branch is cut from the base and up to date with it: `git merge-base --is-ancestor <prs.baseBranch> HEAD`;
   - the branch is **fresh** — no commits of its own: `git rev-list --count <prs.baseBranch>..HEAD` is `0`
     (a branch carrying its own commits may be unrelated work, e.g. a PoC — never hijack it silently);
   - the branch is not recorded as `state.json.branch` of another feature under `featuresRoot`.
   Adoption = record the current branch name via the shipped script (never hand-edit state.json):
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/record-impl.mjs" branch <featureDir> --set <branch-name>`;
   create nothing, ask nothing; the checkpoint report says "branch adopted" instead of "created".
   Otherwise two HIL shapes, by cause:
   - **Current branch has its own commits** (cut from base, up to date, but `rev-list --count` > 0) →
     **HIL**: adopt this branch anyway (its commits become part of the feature branch history) /
     create `<branchTemplate>` off `prs.baseBranch` / another ref.
   - **All other cases** (sitting on the base itself, detached HEAD, branch behind the base, or the
     guard failed) → **HIL** with `AskUserQuestion` "create `<branchTemplate>` off which base?"
     (branch name from `implement.branchTemplate`, default `feat/{slug}`, `{slug}` substituted).
     Options: `prs.baseBranch` (default / recommended); the current git branch (only when it differs
     from `prs.baseBranch`); or another ref (validate with `git rev-parse --verify <ref>` — reject and
     re-ask on failure).
   **Name collision.** Before creating `<branchTemplate>`: if a branch of that name already exists
   (`git rev-parse --verify <name>`), or worktrees/branches matching `fd/<slug>/*` linger while
   `state.json.branch` is null (residue of an older interrupted run) → **HIL**: fresh distinct name
   (suffix, e.g. `<name>-run2`) / hard-reset the existing branch to the chosen base / build on the
   existing branch as-is / stop. Never silently reuse or clobber an existing branch.
   Create the branch off the **chosen** base, check it out, and record it via
   `record-impl.mjs branch <featureDir> --set <name>`. The HIL
   runs on a feature's first `/fd:implement` unless a freshly cut branch was adopted.

8. **Recovery — reconstruct from git, then relaunch the remainder.** `state.json.waveInProgress
   == true` on entry ⇒ a prior session was interrupted mid-run. A Workflow run never survives a
   session exit, so do **not** resume the old run (ignore Workflow `resumeFromRunId`) —
   reconstruct from disk + git:
   - **(a) Done set.** Resolve merged tasks from trailers:
     `git log <base>..<featureBranch> --format='%H %(trailers:key=Task,valueonly)'`. For each task
     with a trailer commit, persist it:
     `node "${CLAUDE_PLUGIN_ROOT}/scripts/record-impl.mjs" record <featureDir> --task <T> --commit <sha> [--commit <sha>…] --status implemented`.
   - **(b) Orphan fixups.** `fixup!` commits without their own `Task:` trailer left by an
     interrupted repair → run the autosquash defensively (`git rebase --autosquash <base>`; abort on
     conflict and keep the fixups as-is), then re-resolve trailers and re-record before trusting
     `impl.commits`.
   - **(c) Salvage set.** Discover leftover task branches (`git worktree list --porcelain`, then the
     `fd/<slug>/T-*` branch pattern) for tasks **not** done. For each, first re-resolve its commits from
     trailers. A branch carrying an `Fd-Gate: pass` breadcrumb → **re-run the cheap per-task gate** (the ACs
     covered entirely by that task + lint of its changed files). Gate pass ⇒ the **merger** merges it and the
     merge is recorded via `record-impl.mjs record` (report it as salvaged). Gate fail, or **no breadcrumb** ⇒ **discard**.
   - **(d) Worktree cleanup.** Delete worktrees **only** for non-salvaged tasks; a salvaged task's worktree
     survives until its merge lands.
   - **(e) Relaunch the remainder.** Launch **one fresh full-cycle run** (Engine below) whose
     `tasks` are only the outstanding ones — their `deps` may point at already-merged tasks; the
     engine treats a dep outside the task list as satisfied. If **every** task is `implemented` but
     `impl.cr` is not `pass` on all → nothing to implement — the engine needs tasks to run, so
     perform the close steps via the subagent fallback (full CI → CR → fixes → autosquash → final
     CI), then record identically.

---

## Engine — one run owns the full cycle; this conversation owns decisions

Waves are **topological layers of the task `deps`** (derived from `sc-map.json`: `from` =
consumer, `to` = producer). The main thread does **not** iterate waves: it computes the task
list once, launches **one** engine run, and handles that run's return. There is **no
materialized execution plan** — the SC map is the only plan.

**Run boundary.** The engine run does the whole delivery cycle internally: per-wave worktree
preparation (serial, cut from the feature branch after the previous wave's merges), task
agents with self-gates and breadcrumbs, the **serial squash-merge** (fd:merger, once per
wave, authoritative order), the per-wave gate — **two agents in parallel**: the
**smoke** (`tooling.typecheck` + `tooling.build`, whichever are configured; both `null` ⇒
skipped LOUDLY in the wave report) and the **AC verifier** (every AC the wave just closed,
proven by a targeted test run or, where no test can exist, by code inspection; an
unverified AC is a failure `ac:<id>`) — a **bounded repair loop** (K =
`implement.maxRepairIterations`; unmerged tasks repair in their worktrees, merged code repairs
as fixups on the feature branch, strictly serial), and — at feature close — the feature's
FIRST full CI (lint + test + build, whole repo), the whole-feature **code review**, mechanical
fixes, `git rebase --autosquash`, and the final full CI. Lint and the full test suite
deliberately do NOT run between waves: they judge end states and false-flag intermediate ones
(e.g. exports whose consumers arrive in a later wave), and a false red feeds the repair loop.
The main thread keeps: all preconditions, building the run args, persisting state at run
boundaries (via `record-impl.mjs`, from `Task:` trailers), and every HIL.

- **Run engine.** The run executes the **shipped** script
  `${CLAUDE_PLUGIN_ROOT}/scripts/wave-implement.mjs` via the **Workflow** tool (`scriptPath`) — a
  Claude-Code dynamic-workflow script that calls the harness `agent()`; **never invoke it with `node`**.
  Workflow availability is detected by `/fd:config` and re-verified on entry.
  **Launch protocol (corruption defense):** compose the args once into a canonical
  `<featureDir>/engine-args.json`, written with the **Write tool** — never a Bash heredoc (free
  text like HIL decisions can trip repo hooks, and hand-relaying JSON is how a field run
  corrupted a `serializeAfter` edge into a self-reference). Pass that file's parsed content
  **verbatim** as the one `args` value; any change goes through regenerating the file first,
  never an inline edit of the payload. Include `tasksCount` (= `tasks.length`) — the engine
  cross-checks it as a truncation tripwire. It may reach the script as a JSON string, which the
  script parses defensively:
  - **args:** `{ mode: "full"|"repair", featureDir, slug, repoRoot, featureBranch, baseBranch,
    tasksCount, tasks: [{ id, worktree, branch, taskFile, deps, serializeAfter?, acIds, diagnosis?, decision? }],
    gate: { lintChanged: true }, ci: { typecheck, lint, test, build, packageManager } (the
    `tooling.*` commands verbatim, `null` = confirmed absence), gateDebt?: { smoke, acs },
    worktreeSetup, worktreeCleanup, codeReview: { skills }, repair: { maxIterations }, close: true }`.
    Per task: `deps` = its intra-feature producer tasks (from sc-map edges), `acIds` = the ACs it
    covers entirely (from `covers` + ac-map), `decision` = the human answer when relaunching after
    an escalation. `gateDebt` = the red gate remainder of a prior run's escalated wave (copied
    from that run's wave report — see Escalations); the engine settles it (fresh smoke +
    re-verification + repair loop) **before** wave 0, so new worktrees are never cut from a
    known-red branch.
  - **returns (discriminated on `status`):**
    - `{ status: "completed", waves, tasks, close: { fullCi, cr, finalCi } }` — the cycle finished.
    - `{ status: "continue", reason, waves, tasks, remaining }` — internal agent budget spent;
      **persist and relaunch immediately with the remaining tasks — no HIL.**
    - `{ status: "escalated", escalations: [{ kind, taskId?, wave?, question, options, context }],
      waves, tasks, remaining }` — a human decision is required (see Escalations below). An
      escalated wave's report entry carries `gateDebt` when its gate ended red.
- **Fallback** (no Workflow tool, or `implement.engine == "subagents"`) → this main thread runs the
  **same full cycle itself** via parallel **Agent-tool** subagents: per-task worktree isolation, the
  same task-agent prompts and gates, serial merger calls, its own Bash for CI, the repair loop, and
  the close steps — escalations become direct `AskUserQuestion`s. Report the degradation; do not
  block on it.
- **Orchestration rule.** Await the run's (or the subagents') completion **directly**. Never
  foreground-`sleep`, never poll the filesystem — the harness returns the structured results when the
  agents finish.

### Escalations & HIL (the only mid-cycle interrupts)

The run early-returns `status: "escalated"` **only** for:

- **`architectural`** — a task agent found something the spec does not cover with more than one
  viable design; it stopped without guessing. → `AskUserQuestion` with the returned question and
  options; relaunch with the remaining tasks, attaching the answer as that task's `decision`.
  The escalated wave's gate (smoke + AC verification) still ran on whatever merged — repair did
  not (the pending decision could invalidate it). If that gate ended red, the wave report entry
  carries `gateDebt` — **copy it into the relaunch's `args.gateDebt`** so the next run settles
  it before cutting new worktrees; fold `--gate` only for waves whose gate ended green.
- **`repair-exhausted`** — a wave (or the close, or an inherited gate debt) is still red after K
  repair iterations. → Present the diagnosis; the user decides (fix by hand and relaunch / drop
  scope / stop).
- **`cr-judgment`** — a code-review finding that needs a human call (design trade-off, scope
  question). → Present finding + report file; on "fix it" answers, relaunch (the remaining-task
  list may be empty except the repair) or apply the fix via the fallback path, then re-close.
- **`engine-failure`** — an engine agent returned no result. The engine **cannot see why**
  (`agent()` yields null for a kill, a terminal API error, and an account rate limit alike), so
  **classify before asking anything**: if the failure coincided with a session/rate limit (the
  workflow's failure notification says so, or this conversation itself just hit its limit), it
  is **not a bug** — the branch and trailers are intact; report "session limit — wait for the
  reset, then relaunch (or say Continue)" and do **not** raise a scary HIL. Only when no limit
  signal exists: run the precondition-8 salvage (trailers are the ledger), then relaunch the
  remainder.
- **`invalid-args`** — the args failed the engine's validation (self-referencing edge, count
  mismatch, malformed ids); **no agent ran, nothing was touched.** → Regenerate
  `engine-args.json` from the canonical inputs, relaunch with the file's content verbatim — no
  HIL. HIL only if regeneration reproduces the same error (the inputs themselves are wrong).

On **every** return (completed, continue, escalated): first persist progress — re-resolve merged
tasks from `Task:` trailers and record them (State ownership below) — then act on the status.
`continue` never asks anything: persist, relaunch with `remaining`.

### Task-agent contract (single source of truth)

Every task agent — spawned by the shipped script or by the subagent fallback — follows the **same**
directives (the script embeds them verbatim; the fallback reuses them):

- The task file is **self-contained** — do not re-grep or rediscover paths, symbols, or contracts
  already named in its body or `codeDeps`. Read it once and trust it.
- **Batch edits**, then run typecheck + lint **once** at the end — never after every edit.
- **Stub, never recreate**, a missing dependency file: a peer task's producer owns it, so write a
  minimal, contract-satisfying stub only. Do not touch files this task does not own.
- Commit **atomically**, piece by piece, on the worktree branch, with decision rationale in each message.
- **Escalation rule:** when the spec is silent on something the task needs and more than one viable
  design exists, do **not** pick one — return `status: "escalated"` with the question, options, and
  self-contained context. No breadcrumb, no further edits.
- **Final act, after the self-gate passes:** one **empty breadcrumb commit** on the worktree branch
  with trailers `Task: <id>` + `Fd-Gate: pass` (a one-line gate summary in the body). Self-gate fails →
  write no breadcrumb; return `status: "failed"` with a diagnosis.

### State ownership — single writer, at run boundaries

The manifest (`feature.lock.json`) and `state.json` are written **exclusively by this main
conversation** — never by the engine's agents — and always **through the shipped scripts**,
never by hand-editing JSON. The engine's durable ledger is git: every squash-merge carries a
`Task: <id>` trailer, so nothing is lost even on a hard crash.

- At first launch: `node "${CLAUDE_PLUGIN_ROOT}/scripts/record-impl.mjs" phase <featureDir> --phase implementing --wave-in-progress true`.
- At **every** run return: resolve `git log <base>..<featureBranch> --format='%H %(trailers:key=Task,valueonly)'`
  and record each newly merged task:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/record-impl.mjs" record <featureDir> --task <T> --commit <sha> [--commit <sha>…] --status implemented`
  (a trailer left on more than one commit — e.g. an autosquash conflict — records **all** those SHAs).
  Fold in the returned verdicts: a wave whose gate ended green (smoke pass — or loud skip —
  AND every closed AC verified) → `record … --task <T-…,…> --gate pass` (`impl.gate` = the wave
  gate, deliberately NOT named "ci" — the full pipeline runs once per feature and lands in
  `state.close`); a completed close → `record … --task <all-implemented> --cr pass` **and**
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/record-impl.mjs" close <featureDir> --full-ci pass --cr pass --final-ci pass`
  (incremental: an escalated close records whatever already ran, e.g. `--full-ci pass` alone).
- **Canonical commit identity is the `Task: <id>` trailer;** `impl.commits` is a derived cache.
  After the close's autosquash the SHAs changed — the trailer re-resolve at the `completed` return
  refreshes the cache (plain `record`, not `--append`; append is for adding SHAs to a live task).
- On `completed` (with close): `node "${CLAUDE_PLUGIN_ROOT}/scripts/record-impl.mjs" phase <featureDir> --wave-in-progress false`.
  `waveInProgress` stays `true` across `continue`/`escalated` relaunches — it is the crash signal.
  `phase` stays `implementing` — flipping to `shipped` remains ship-detection's job (precondition 4),
  after the feature branch merges to `baseBranch`.

**Task state machine** (this command owns two transitions):

```
ready ──(wave start)──▶ in-progress ──(self-gate + merge)──▶ implemented ──(ship-detect)──▶ shipped
                             └──(failure)──▶ stays out of implemented until repaired or escalated
```

A task enters as `ready` (set by `/fd:to-tasks`). The engine works the task; this conversation
records `implemented` from its trailer at the next run boundary. (`in-progress` exists for
observability; with recording at run boundaries it may be skipped over — a task can go
`ready → implemented` in one recording.) `shipped` is set by nobody directly — only
ship-detection (precondition 4) flips it once `impl.commits` are reachable from `baseBranch`.

---

## Wave mechanics (inside the run)

- **Isolation & naming.** One git worktree per task. Worktree path `<repo>/.fd-worktrees/<slug>/<T-id>`,
  branch `fd/<slug>/<T-id>` — both derive from the feature slug, never from the feature branch's own
  name (an adopted branch changes nothing here). The main thread precomputes these names into `args.tasks`.
- **Per-wave worktree preparation (serial).** The engine cuts each wave's worktrees from the feature
  branch **after** the previous wave's merges (so later tasks see merged code), strictly sequentially
  (concurrent `git worktree add` races on `.git/worktrees`), force-removing stale paths first, and
  bootstraps each with the `implement.worktreeSetup` commands (e.g. `pnpm install`).
- **Footprint serialization.** Computed by the main thread before launch, over each wave's tasks
  (both from `codeDeps` + file paths named in each task body). **Edges come from exact-file
  overlap ONLY** — a directory path (e.g. `backend/src/cerbos/`) never creates an edge, it is
  read-context: git does not conflict on two different files in one directory, and a
  directory-prefix match over-serializes an entire shared area (a field run produced 54 spurious
  pairs from one directory `codeDep`, killing the wave's parallelism). Two tasks creating the
  **same new file path** still overlap exact-file. Skipped directory-level overlaps are named in
  the launch narration ("N directory-overlap pairs ignored") — dropped loudly, never silently.
  - **write ∩ write** — two tasks that write the same file serialize.
  - **read-after-write** — a task whose `needs` (its `codeDeps` + import/file paths named in its body)
    intersect a peer's `willWrite` (file paths the peer names for the elements it produces), with **no**
    existing `consumes` edge between them, must **serialize after** that peer (encode as
    `tasks[].serializeAfter`) or **defer to the next wave** (where the peer is already merged).
  Serialized tasks run in later batches; disjoint tasks run in parallel. Honest caveat: the element→file
  mapping is body-parsed, best-effort — the **primary** guarantee is the stub rule plus the merge and CI
  gates, not this heuristic. (`serializeAfter` refs across waves are filtered by the engine — wave order
  already guarantees them.)
- **Task work.** Per the task-agent contract above: batch edits, self-gate, one breadcrumb commit.

---

## Gates (inside the run, except entry gates)

**Per task = the task agent's self-gate (breadcrumbed).** Each task agent validates the ACs
**covered entirely by that task** (its `acIds`) + lints its **changed / created files only**, then
writes the `Fd-Gate: pass` breadcrumb. ACs spanning more than one task are not verifiable here —
they wait for the wave AC verifier.

**Merge = squash (serial, once per wave).** The engine invokes the **merger** (`fd:merger`) once per
wave with the passing tasks in authoritative order; the merger squash-merges each worktree branch
into the feature branch as exactly **one commit**, trailer `Task: <id>`, rationale gathered from the
worktree's piece-commits (the empty breadcrumb excluded), and reports per-task
`merged | conflict | blocked` + SHA. Merges run **strictly serially** — zero branch races. Recording
happens at the run boundary, from trailers.

**Per wave, after the merges (block) = two agents in parallel.**
- **Smoke** — `tooling.typecheck` + `tooling.build` (each that is non-null) at the repo root:
  broken types/APIs are the one failure class that compounds, because the next wave's worktrees
  are cut from this branch. NO lint, NO test suite — those judge end states and false-flag
  intermediate ones (e.g. exports whose consumers arrive in a later wave). Both commands `null`
  ⇒ the smoke is **skipped loudly** (named in the wave report), never silently passed.
- **AC verifier** — every AC **closed by this wave** (last producer just merged), each proven by
  the strongest applicable method: `covered-by-test` (run just that test, targeted), or
  `verified-by-inspection` when no test can meaningfully exist (config value, removal, wiring).
  `unverified` is a wave failure `ac:<id>` — a missing test for testable behavior is unverified,
  never inspection-passed. Verification methods land in the wave report.
  Both agents report literal exit codes / per-AC verdicts — a "pass" claim with a non-zero exit
  (or an unverified AC) is downgraded to fail by the engine.

**Repair loop (bounded, inside the run).** Failed tasks and merge conflicts repair **in their own
worktrees** (parallel, re-merged by the merger); smoke failures and unverified ACs sit on
already-merged code, so they repair as **one serial feature-branch agent**. Its commit surgery
(the agent first builds the task→commit map from the `Task:` trailers):
- a fix confined to one task's files → `git commit --fixup <that task's commit>`, one fixup per
  culprit — so `/fd:to-prs` still slices clean per-task commits after autosquash;
- a **cross-cutting** fix (files of more than one task, or outside any footprint) → a normal
  **integration-fix commit**: subject `fix(integration): …`, trailers `Task: <culprit>` +
  `Integration-Fix: true` — it rides into the culprit's PR by its trailer, is never
  autosquashed, and keeps the clean change and its blast-radius adaptations separately
  reviewable; files created by a **later** task split off onto that task's trailer (one commit
  spanning owners breaks the PR-stack rebase);
- an `ac:<id>` failure fixups onto the owning task's commit;
- **never delete or weaken a test to make the gate pass** — a red test is a diagnosis.
Then re-run the smoke + **re-verify ALL of the wave's closed ACs** (never just the
still-unverified subset — a repair may have deleted the very test that covered an AC, and no
other gate would notice a test that no longer runs); loop at most K =
`implement.maxRepairIterations` iterations; exhaustion → `escalated`.
**On a wave escalation** the gate runs but the repair loop does not (the pending human decision
could invalidate it) — a red verdict returns as the wave report's `gateDebt`, settled at the
start of the relaunch (before wave 0, same repair loop, same K).

**Code review is not a per-wave gate** — it runs once over the whole feature at **Feature close** (below).

**Worktree cleanup.** Per `implement.worktreeCleanup` (`always` | `keep-failed`), executed by the
merger after each successful merge; the engine force-removes stale paths when preparing a wave. On
recovery the salvage decision gates deletion: a salvaged task's worktree survives until its merge
lands; non-salvaged task worktrees are deleted.

---

## Feature close (inside the run)

Once all waves are merged and green, the engine closes the feature in the same run:

1. **Full-repo CI** (`tooling.lint` + `tooling.test` + `tooling.build`, unfiltered) — the
   feature's FIRST full pipeline, so a red here is expected more often than before: the repair
   agent starts from the trailer-built task→commit map for attribution, and an
   exported-but-unused symbol that maps to a spec element or `produces` contract is NOT dead
   code (its consumers may live in a future feature) — never auto-deleted. Red → the serial
   feature-branch repair loop (K cap) → still red ⇒ `escalated`.
2. **Whole-feature code review (gate).** The engine writes `git diff <base>...<feature>` (with the
   name list) to `<featureDir>/cr-diff.patch` and hands the CR agent that **file path** — the agent
   `Read`s it; the diff is **never inlined** into a prompt. The CR agent invokes **each**
   `codeReview.skills` skill **by name via the Skill tool** (≥1), writes the full report to
   `<featureDir>/cr-report.md`, and classifies every finding `mechanical` (objectively fixable) or
   `judgment` (needs a human). **No** nested fan-out and **no** network research.
3. **Findings:** `judgment` → `escalated` (one escalation per finding, report file attached);
   `mechanical` → the serial feature-branch repair agent fixes them as `--fixup` commits.
   A contract-bearing unused export is classified `judgment`, never `mechanical`.
4. **Autosquash.** `git rebase --autosquash <base>` folds fixups into their targets (conflict →
   abort the rebase, `escalated`); the engine verifies every `Task:` trailer survived.
5. **Final full CI** confirms the tree is still green after fixes + autosquash. Red ⇒ `escalated`.

The `completed` return carries `close: { fullCi, cr, finalCi }`; the main thread then records
`--cr pass`, persists the feature-level verdicts via `record-impl.mjs close … --full-ci pass
--cr pass --final-ci pass` (the block `/fd:to-prs` gates on), refreshes `impl.commits` from the
post-autosquash trailers, flips `waveInProgress = false`, and reports.

**Resume:** entry finds **all** tasks `implemented` but `impl.cr` not `pass` on all ⇒ nothing to
implement — perform the close steps via the subagent fallback (the engine needs tasks to run), then
record identically.

---

## Boundaries

- **Spec freeze during a run.** While `waveInProgress`, the spec is frozen. Requirement changes land
  in `spec.md` as ordinary edits and are picked up by the **next** `/fd:to-tasks` (re-entry drift
  detection will block until then) — never by the running engine.
- **Mutability.** Earlier waves' code is mutable via repair work **within the run**. Once **all**
  tasks are `implemented` / `shipped`, the grill → to-tasks → implement path is **closed** for this
  feature (forward-only); further change is a new feature.
- **Degenerate.** 1 task → 1 wave, 1 worktree, zero parallelism — same engine, same cycle, same gates.

---

## Gate table

| Gate | Where | Type |
|---|---|---|
| Missing / invalid config | entry | block |
| Schema migration (lower → apply; higher → halt) | entry | HIL / block |
| Feature selection (>1, no match) | entry | HIL |
| Base-branch selection (first run) | entry | HIL (skipped when a freshly cut branch is adopted) |
| Adoption of a branch carrying its own commits | entry | HIL |
| Feature-branch name collision / stale `fd/<slug>/*` residue | entry | HIL |
| Ambiguous ship (e.g. squash-merge) | entry, reconcile step 1 | HIL |
| Spec / task drift in detection (no apply) | entry | block |
| DoR-tasks enforcement + upstream `delivered` | entry | block |
| Ambiguous upstream `delivered` (squash-merge) | entry, cross-feature | HIL |
| Salvage gate re-check on recovery | entry | block (per task) |
| Per-task AC (covered entirely) + lint of changes = self-gate | in run, wave | block |
| Per-wave smoke (typecheck + build; both `null` ⇒ loud skip) | in run, wave | block |
| Per-wave AC verification (test or inspection; unverified ⇒ repair) | in run, wave | block |
| Gate on an escalated wave (runs; repair deferred as `gateDebt`) | in run, wave | block (settled at relaunch) |
| Gate-debt settlement (inherited red gate, before wave 0) | in run, entry | block |
| Verdict reconciliation (pass + non-zero exit / unverified AC ⇒ fail) | in run, wave + close | block |
| Args validation (`invalid-args`: self-ref, count mismatch) | launch → early return | auto-regenerate + relaunch (no HIL) |
| Architectural spec gap found by a task agent | in run → early return | HIL |
| K-iteration repair exhaustion (wave, close, or gate debt) | in run → early return | HIL |
| Feature-close full-repo CI | in run, close | block |
| Feature-close whole-feature code review (≥1 skill) | in run, close | gate |
| CR judgment finding | in run → early return | HIL |
| Internal agent-budget checkpoint | in run → early return | auto-relaunch (no HIL) |

---

## Output / checkpoint

Report: tasks implemented (with `Task: <id>` commit SHAs); per-wave smoke status (including
**loud skips**) + AC verdicts with **the method that proved each AC** (test / inspection) and
repair iterations used; any
`continue` checkpoints (count them — they are invisible to the user otherwise); on a resumed
session, which tasks were **salvaged** vs **re-run**; the feature-close **full CI + code-review**
results (findings + report file); any HIL escalations and their resolutions; and whether the run
degraded to subagents. The feature branch now holds the whole feature as a linear,
one-commit-per-task history (plus any explicit `Integration-Fix` commits, each riding its
culprit's `Task:` trailer). Suggest as prose (do **not** run it): self-review the feature branch,
then `/fd:to-prs`.

---

## Edge cases

- **Unknown KIND / malformed anchor in spec** (`hasher` `unknownKinds` or `malformedAnchors`
  non-empty) surfaces as spec drift handling in `/fd:to-tasks`, not here — it means the spec is not
  in a clean, tasked state → block to `/fd:to-tasks`.
- **No `sc-map.json` / manifest** → the feature was never tasked → the reconcile-detect sc-map check blocks first (both routes point to `/fd:to-tasks`).
- **Merge conflict the merger cannot resolve mechanically** → returned as `conflict` with a
  diagnosis → the in-run repair loop, not a guess.
- **A merger / CI / close agent returns no result mid-run** → the engine early-returns `escalated`
  (`engine-failure`); **classify first** — a session/rate limit is the common cause on long runs
  and needs only "wait for the reset, relaunch", not salvage. No limit signal → trailers are the
  ledger; salvage (precondition 8) reconstructs, then relaunch.
- **Args corruption at launch** (`invalid-args` return: self-referencing edge, count mismatch) →
  nothing ran; regenerate `engine-args.json` and relaunch — HIL only if the error reproduces from
  clean inputs.
- **Session exits mid-run** → next invocation hits recovery (precondition 8):
  - **before any merge** → no task is done; every breadcrumbed branch is re-gated, then salvaged or discarded.
  - **mid-merges** (some tasks on the branch) → done tasks are recorded from trailers; the rest salvage.
  - **during an autosquash** → orphan `fixup!` commits are folded defensively before `impl.commits` is trusted.
  - **salvage-fail** (breadcrumb present but the re-gate fails, or no breadcrumb) → discard the branch and
    re-run the task.
- **Degraded engine** (no Workflow tool / `implement.engine == "subagents"`) → same contract, cycle,
  and gates via Agent-tool subagents; the degradation is reported, not a block.
