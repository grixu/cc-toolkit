---
description: Cut a stacked set of PR branches out of a completed feature branch for human code review. User-run only.
argument-hint: "[slug]"
disable-model-invocation: true
---

Turn a feature branch's linear, one-commit-per-task history into a readable **stack of PR branches**
for human review — the second real merge-to-main gate, alongside the automated CR in `/fd:implement`.
It exists so human review stays doable across a few to a few dozen PRs.

`$0` (optional) = feature slug. Cold-start from disk. Plugin files resolve via
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

1. **Config.** Read `.claude/fd-config.json`. Missing / unparsable / `schema` mismatch → STOP:
   "run `/fd:config`". Keep `prs.baseBranch`, `prs.grouping`, `prs.model`, `prs.verifyPerPrCi`.

2. **Feature selection.** Same rule as `/fd:implement`: `$0` slug → else the single feature under
   `featuresRoot` → else match `state.json.branch` to the current git branch → else **HIL** list.

3. **Schema migration.** `node "${CLAUDE_PLUGIN_ROOT}/scripts/migrate.mjs" <featureDir> --dry-run`.
   Lower `schema` → report → **HIL** → apply. Higher → STOP: "update the plugin".

4. **Implementation completeness (BLOCK).** Read the manifest; **every** task must be `implemented`
   or `shipped`. Any other status → STOP: "finish `/fd:implement` first". (This command never runs
   the implementation loop; it only projects a completed branch.)
   **Close verdict (BLOCK).** Read `state.json.close`: `finalCi` must be `"pass"` — that is the
   feature's only full-pipeline verdict (per-task `impl.gate` records only the wave smoke + AC
   gate). Missing block or anything but `pass` → STOP: "the feature close never went green —
   finish `/fd:implement`'s close first".

5. **Artifacts present.** `state.json.branch` set and checked out, `sc-map.json` + `feature.lock.json`
   readable. Whole-branch human self-review is assumed already done (outside the plugin); the user's
   own commits are handled in the flow below.

---

## Model

Integration already happened on the single feature branch (`/fd:implement`); this command **cuts**
PR branches out of it. It delivers branches; opening PRs is optional.

- **Stacked** (`prs.model`): `PR_n` is based on `PR_{n-1}`; the stack base is `prs.baseBranch`
  (default `main`). Review and merge **bottom-up**.
- **Stack order** = a topo-sort linearization of the SC DAG: foundation at the bottom, each
  capability slice above.

Why this is cheap: the feature branch is already a linear one-commit-per-task history in topological
order (squash-merge per task + autosquash of repairs). A stack is a **partition** of that history —
PR branches are **pointers** into it, so commit SHAs stay identical to `impl.commits` and ship-detection
keeps working without translation.

**Integration-fix commits** (subject `fix(integration): …`, trailers `Task: <culprit>` +
`Integration-Fix: true`) are the loop's cross-cutting repairs, deliberately **not** autosquashed:
they carry a `Task:` trailer, so the partition pulls them into the culprit task's PR like any
other trailer commit. A task PR carrying blast-radius adaptations of other areas is **correct**,
not boundary drift — the buildability invariant (step 4) requires the breaking change and its
downstream adaptations to land in the same PR.

---

## Flow (numbered; explicit STOP / HIL)

1. **Absorb outside-loop commits first.** Scan the feature branch for commits that are not the
   loop's own task commits:
   - `--fixup!` commits → `git rebase --autosquash` into their targets **before** partitioning.
   - Ordinary commits with **no `Task:` trailer** (human self-review after CR) → **HIL** assignment
     to a task / PR group; they join that group's partition in an order that preserves buildability.
   - **No commit may be dropped.** An unassigned commit → **BLOCK**.

2. **Linearize.** Topo-sort the SC DAG (foundation first) into the target stack order.

3. **Group.**
   - **Auto (default, `prs.grouping`).** Reuse the decomposition hybrid: foundation → the bottom
     PRs, each capability slice → a PR. Yields a few to a few dozen PRs.
   - **Manual (HIL loop).** The dev assigns tasks to PRs; validate composability at **every step**;
     loop until all tasks are assigned and the stack is valid.

4. **Buildability invariant (BLOCK).** For the stack `[PR_1..PR_m]` bottom-up: for every task
   `t ∈ PR_i`, **all** of its dependencies (producer of each consumed element + `codeDeps` + any task
   touching the same files) lie in some `PR_j` with `j ≤ i`. A grouping choice that violates this
   (forward reference, file split) → the step is **rejected** with an explanation; the dev re-picks.

5. **Reorder-rebase (only if needed; conflict → HIL).** If grouping requires an order different from
   the branch history, `git rebase` **whole task commits** into stack order. This is safe because
   buildability + `/fd:implement`'s footprint serialization already keep the relative order of
   same-file tasks. A rebase conflict → **HIL**.

6. **Update the manifest (the only mutation this command makes).** After a reorder-rebase, write the
   new commit SHAs into `impl.commits` (schema-validated, 2-space JSON) so ship-detection stays
   correct. No reorder → no write.

7. **Produce PR branches** as pointers into the linear history. Optionally open PRs; optionally run
   per-PR CI when `prs.verifyPerPrCi` (an **optional block** gate — a failing PR's CI stops the run).
   When `state.json.close.waivedAcs` is non-empty, every waived AC appears in its **owning task's
   PR description** (id + reason + who/when from the waiver entry; owners via ac-map) — a reviewer
   must see what was consciously not verified, or the waiver silently becomes a pass.

8. **Checkpoint.**

A task whose repair did not autosquash has **>1 commit sharing its `Task: <id>` trailer** — the
partition takes **all** commits with that trailer.

---

## Edge cases

- **Degenerate** (1 task, or grouping yields 1 group) → a **single PR** on `baseBranch`: no stack, no
  reorder-rebase; buildability holds trivially.
- **File overlap between two slices** → a shared PR, or adjacency in the stack (in stacked, order suffices).
- **High-fan-out foundation** → the bottom of the stack; everything above depends on it naturally.
- **Task too large to review even alone** → a signal it should have been split in decomposition →
  feedback to `/fd:to-tasks` / `/fd:grill`.
- **Independent work serialized by stacking** → an accepted cost of choosing the stacked model.
- **Idempotent re-projection.** `/fd:to-prs` is a re-projection: after human CR requests changes, the
  user commits on the feature branch (plain or `--fixup`) and reruns — the rerun refreshes the stack
  (absorb → repartition → rebase up). The grill → to-tasks → implement path stays closed once
  implementation is complete (forward-only); human CR flows only through these re-projections.

---

## Gate table

| Gate | Where | Type |
|---|---|---|
| Missing / invalid config | entry | block |
| Schema migration (lower → apply; higher → halt) | entry | HIL / block |
| Feature selection (>1, no match) | entry | HIL |
| Implementation completeness (all tasks implemented / shipped) | entry | block |
| Close verdict (`state.close.finalCi == "pass"`) | entry | block |
| Foreign-commit assignment (no `Task:` trailer) | flow | HIL |
| Manual PR grouping | flow | HIL |
| Buildability invariant | flow | block |
| Reorder-rebase conflict | flow | HIL |
| Per-PR CI (`prs.verifyPerPrCi`) | flow | optional block |

---

## Output / checkpoint

Report: the stack order, the task → PR assignment, and the produced branch names. Suggest as prose
(do **not** run anything): review and merge bottom-up; on CR change requests, commit on the feature
branch and rerun `/fd:to-prs` to re-project the stack.
