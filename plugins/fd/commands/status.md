---
description: Read-only re-orientation for a feature — readiness verdicts, task states, the SC graph, the program view, and open/blocked gates. Zero mutation. Use it to recover the picture after compacting context.
argument-hint: "[feature-slug]"
disable-model-invocation: true
---

# /fd:status

Compose the current picture of a feature from the artifacts on disk — "where am I, what's next" — without changing anything. This is the **only strictly read-only command**: it never writes, never flips statuses, never runs reconcile-apply, and never marks anything stale.

## Preconditions

Cold-start from the workspace; do not rely on any prior command's context. Plugin files
resolve via `${CLAUDE_PLUGIN_ROOT}`; a file missing after **one** direct check ⇒ STOP and
report a broken fd installation — never search the repo or `$HOME` for plugin files.

**Script contract (applies to every shipped script):**
- Scripts are EXECUTED via the documented one-liners — their stdout JSON is the whole
  interface. Never `Read` a script's `.mjs` source into context; running one with wrong or
  missing args prints a usage error, and that error is the documentation.
- Reading a script's source is allowed only to diagnose an execution that already failed —
  say so explicitly when you do.
- Never re-implement a shipped script inline (hand-assembled state JSON, one-off replacement
  scripts). A job no shipped script covers is a gap: report it, do not work around it.

1. **Config gate (block).** Read `.claude/fd-config.json`. Missing, unparsable, or `schema` mismatch → halt with "run `/fd:config`".
2. **Feature selection.** Optional `$0` slug → use it. Else exactly one feature under the features root (`storage.featuresRoot`, or `storage.shared.specsRoot` in shared mode) → use it. Else match `state.json.branch` against the current git branch. Else present the list with AskUserQuestion (HIL).
3. **Workspace exists.** The feature's `state.json` and artifacts are present. If not, say so and stop.

## Read-only guarantee

The only script run is the hasher — `node "${CLAUDE_PLUGIN_ROOT}/scripts/hasher.mjs" <featureDir> --features-root <featuresRoot-or-specsRoot>` — purely to compute fresh hashes for the staleness report; computing hashes is read-only. `/fd:status` does **not** migrate (migration mutates): if a workspace artifact carries a `schema` newer than this plugin supports, report that and stop; if older, report it and suggest running a mutating command (e.g. `/fd:to-tasks` or `/fd:grill`) to migrate — do not migrate here. Ship / delivered flips belong to the mutating commands' reconcile; `/fd:status` shows the manifest **as-is** plus potential impact, and marks nothing.

## What it reports

Read `state.json`, `feature.lock.json`, `sc-map.json`, `ac-map.json`; assemble:

- **Readiness.** The `readiness.spec` and `readiness.tasks` verdicts (`ready` / `blocked` + failed / waived checks). For each, state whether it is **fresh or stale** by comparing its `validatedHash` against the freshly computed `specHash` / `tasksHash` from the hasher — never against the stored `state.json` hash fields. Report `dimensionsRun` and call out any narrowing versus the full v1 sets (`spec`: structural, coverage, grounding, feasibility, decomposability, non-over-spec; `tasks`: frontmatter, self-contained, sc-integrity, coverage).
- **Tasks.** A table by status: `planned` / `ready` / `in-progress` / `implemented` / `shipped` / `stale` / `dropped`. Show which elements are `delivered` (from the manifest `elements[].status`).
- **SC graph.** A summary of the intra-feature dependency map (nodes, edges, layers) from `sc-map.json`, with `generatedFrom.tasksHash` fresh-vs-stale.
- **Program view.** The cross-feature DAG, computed by scanning `<featuresRoot>/*/feature.lock.json` (in shared mode: `shared.specsRoot`) for `upstream` refs (read-only). Show upstream dependencies of this feature and "who depends on this feature" (potential impact) — this materializes the projection on demand and **marks nothing**.
- **Gate states.** Which transitions are open or blocked: spec → `/fd:to-tasks` (open iff `readiness.spec` is `ready` and fresh); tasks → `/fd:implement` (open iff `readiness.tasks` is `ready` and fresh, and consumed cross-feature `Y#EL@vN` are `delivered`). Note the `phase` (`spec` / `tasks` / `implementing` / `shipped`) as the coarse progress marker.

## Output

A concise status report followed by **one** prose next-step suggestion (consistent with "suggest, don't offer to run"). Control returns to the user immediately.

## Edge cases

- **No spec yet** (fresh scaffold) — report the phase and suggest `/fd:start` or `/fd:from-docs`.
- **Spec present, no tasks** — `tasksHash` is `null`; report the spec readiness and suggest `/fd:to-tasks` when the spec verdict is `ready` and fresh.
- **Stale verdicts** — surface prominently; a stale verdict is invalid, so the corresponding gate reads as blocked even if the stored verdict says `ready`.
- **Dangling upstream ref** in the program view — flag it as a potential feasibility issue for `/fd:grill`, without altering anything.
