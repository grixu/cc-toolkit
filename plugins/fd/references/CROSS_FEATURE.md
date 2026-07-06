# CROSS_FEATURE — dependencies between features (program level)

When one feature (X) depends on elements of another (Y), you move one level above the
intra-feature dependency graph. **A program is a DAG of features.** Reuse the same
apparatus as inside a feature — content-addressing, versioned contracts, acyclicity,
projection-not-source — lifted one level; do not introduce new invalidation machinery or
new config knobs.

## Reference grain: element + hash

X declares its dependency at the grain of **an element with a contract version**, not a
whole spec:
- A **cross-feature edge** is `<slug_Y>#<EL>@vN` (e.g. `checkout#API-2@v2`) — the
  intra-feature edge `T::EL@vN` extended across a feature boundary. `#` marks
  **feature scope**; `::` marks **task scope** (intra-feature).
- Task X's frontmatter (`consumes`) holds cross-feature refs like `checkout#API-2@v2`
  alongside intra refs like `T-3::DB-1@v1`.
- X's manifest (`feature.lock.json`) gets an `upstream` block, one entry per upstream
  feature:

```json
"upstream": [
  { "slug": "checkout", "path": "docs/features/checkout/", "specHash": "sha256:…",
    "consumes": ["API-2@v2", "DB-1@v1"],
    "elements": { "API-2": { "hash": "sha256:…", "version": 2 } } }
]
```

For an upstream feature inside the workspace, consumed-element hashes are read live from
its manifest; the pin's `elements` map is the fallback. For a spec outside the workspace
(the portable `path + hash` form) there is no manifest to live-read, so the `elements`
map is required — one entry per consumed element, `hash` mandatory.

### Two-level staleness

The `specHash` pin is a **cheap tripwire** ("something in Y moved → go drill the
elements"); real staleness is decided on the **hash of the consumed element**. The current
hash of the consumed element, read from Y's manifest, enters task X's `inputHash`. So if
Y changes an unrelated element, `specHash` moves but `API-2`'s hash stands — X is **not**
stale. The `@vN` suffix carries breaking semantics: a non-breaking change moves only the
hash (→ refresh the `fd:copy` copy, below); a `@vN` bump marks a contract change that
requires a human re-point decision (reconcile → HIL).

### Identification and bounded context

Within the workspace, refer to Y by **slug** (stable; its path is derivable from the
`docs/features/<slug>/` layout). Use `path + hash` as the portable form for a spec outside
the workspace or repo. A pin always carries `specHash`.

A feature belongs to exactly one bounded context. X's grill and tasks use **only their own
BC's `CONTEXT.md`**. Consuming an element from another BC does **not** pull the foreign
`CONTEXT.md` — it goes through the versioned contract `Y#EL@vN`, whose essential content is
copied into X's spec and tasks anyway (self-containment). The researcher subagent may read
Y's spec/manifest read-only to ground the contract, but the domain model stays scoped to
X's own BC.

### Contract copies — `fd:copy` markers

Wrap upstream contract content copied into an X task in markers:

```markdown
<!-- fd:copy checkout#API-2@v2 sha256:… -->
…copied element content…
<!-- /fd:copy -->
```

The marker carries the ref and the hash of the source content, so upstream drift is
machine-locatable. The **copy-refresher** subagent refreshes these during `/fd:to-tasks`
apply: for a task that is stale **only** because of upstream drift, it replaces the marked
block's content with the element's current content and bumps the hash in the marker — no
full task regeneration. The hasher then recomputes the task's `contentHash` and
`inputHash`.

## Emergent topology, computed view

There is **no authored `program.json`**. The source of truth is the `upstream` references
in feature manifests; the program graph is a **projection** computed by traversing them,
never written by hand. Reverse (downstream) edges are **not stored at Y** — X records
"I depend on Y"; Y does not know about X. "Who depends on Y" (impact analysis) is a
projection computed by **scanning `docs/features/*`** for `upstream` refs. Materialize the
program DAG on demand, read-only.

## Propagation: pull at X's reconcile

Upstream movement is detected by X itself. On reconcile (re-entry), X re-reads its pinned
upstream manifests; through the `specHash` tripwire it compares consumed-element hashes; a
moved hash makes the consuming tasks stale (non-breaking → refresh the `fd:copy` copy;
`@vN` bump → re-point decision at the HIL reconcile). This wires into the existing
mechanism: consumed cross-spec contract hashes enter task `inputHash`, so upstream drift
bumps `inputHash` and triggers **the same surgical invalidation** as intra-feature
drift — zero new machinery. Marking stale is a pull (lazy, authoritative in X's manifest);
the global "who would fall over" is the computed read-only view — it shows potential impact
without marking anything.

## Plugin role: track, validate, advise order

The plugin does **not** orchestrate cross-feature builds (that would break "a command is a
discrete unit"):
- **Track** — dependencies in the manifest and task frontmatter.
- **Validate** (the feasibility dimension, extended) — for each `Y#EL@vN`: (a) Y exists at
  the pinned path/slug and is loadable; (b) `EL` exists in Y and is produced by Y (a node
  in Y's task graph); (c) version `@vN` is compatible with / reconcilable against Y's
  current contract; (d) the program DAG is acyclic. These are hard checks (fail = blocker,
  human-only waiver).
- **Advise order** — topo-sort the program DAG (foundation features first), one level
  above the PR stack. This is **advice** in the reconcile / validation output, not
  execution — the human sequences features.

## Temporal nuance: upstream not yet built

You may **plan and decompose** X against a Y that exists only as a spec — spec → tasks for
X does not require a built Y. But **`/fd:implement` on X needs Y's real code.** The DoR at
`/fd:implement` entry is extended: each consumed `Y#EL@vN` must be `delivered` in Y's
manifest, or it is a blocker. Because the grain is the element, both the block and the
order advice are element-precise ("build Y — or at least `API-2` — before X"), not merely
feature-coarse.

`delivered` in Y is set by ship-detection in Y's own reconcile, so Y's manifest may be out
of date (nobody ran a command on Y after the merge). Therefore the DoR check computes
delivered **live**: it reads Y's manifest and verifies that the producer tasks' commits are
reachable from `baseBranch` (the same detection, here read-only — only Y's own reconcile
flips Y's manifest). An ambiguous case — commits unreachable but a `git patch-id` match
suggests a squash-merge — goes to HIL (batched), not a blind block.

## Edge cases

- **Upstream element deleted or renamed** → X's `consumes` dangles → a feasibility blocker
  → HIL (re-point / drop / waiver).
- **Cross-spec cycle** → an acyclicity violation → HIL: extract a shared **foundation
  feature** (analogous to lifting a shared element into its own task).
- **Rollback of Y ≠ rollback of X** — as intra-feature but across the boundary: reverting
  Y's contract puts X's consumers stale; if X's implementation is already complete, a
  **new feature** closes the change (forward-only).

Discover sibling features from the `docs/features/` layout. Dependency data lives in the
manifest and frontmatter, never in config.
