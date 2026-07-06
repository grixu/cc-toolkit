# fd — spec-driven feature delivery

`fd` carries one feature from an idea or a pile of documents, through a validated
spec and a set of self-contained tasks, into a wave-based implementation, and out
as a stack of reviewable PRs. The spec is the single source of truth; the tasks,
the dependency maps, and the code are all **projections** of it (spec → projection
→ code). When requirements change you edit the spec, and `fd` runs a surgical
reconcile against what already exists — it re-derives only the tasks that actually
depend on what moved, instead of regenerating everything from scratch.

Two commitments shape how it behaves. **Gates are hard and binary:** every quality
check is pass or fail, every fail is a blocker, and only a human lifts a block —
with a logged waiver. The model never quietly downgrades a defect to a warning.
And there is **no auto-chaining:** each of the eight commands does one thing,
validates its work, reports a verdict, and hands control back. Nothing runs the
next command for you — the commands are not even model-invokable. You review each
artifact, clear or compact your context, and drive the next step yourself.

## fd vs. feature-delivery (v1)

`fd` is the successor to the [`feature-delivery`](../feature-delivery/) plugin, but
a **separate product** — both install side by side. v1 is untouched: there is no
migration path and `fd` neither reads nor converts v1 workspaces. `fd` namespaces
its commands under `/fd:*`, so the two never collide.

## Requirements

- **Node.js (LTS) on your `PATH`** — a hard requirement, independent of your
  project's stack. `fd`'s deterministic core (content hashing, the SC/AC map
  projections, the token estimator, schema migrations) is a set of
  dependency-free Node scripts. Without `node` nothing works, and `/fd:config`
  **blocks** if it can't find the binary.
- **git** — feature branches, worktrees, squash-merges, and the stacked-PR cut all
  run through git.
- **Recommended MCP servers: `firecrawl`, `context7`, `codebase-memory-mcp`** — used to
  ground external claims in the spec (web docs, library docs, and your own code
  respectively). They are recommended, not required: grounding degrades to
  best-effort when a server is unreachable, and `/fd:config` treats their absence
  as a warning, never a block.

## Install

From the `grixu/cc-toolkit` marketplace:

```
/plugin marketplace add grixu/cc-toolkit
/plugin install fd@cc-toolkit
```

## Quickstart

Run each command explicitly; each stops at its boundary and suggests — but never
runs — the likely next step. `/fd:status` is read-only and safe to run at any
point.

```
/fd:config
```
Detects your stack, walks you through storage/tooling/validation choices, and
writes `.claude/fd-config.json`. **Every other command refuses until this exists
and validates.** Blocks if `node` is missing, if a configured code-review skill is
unreachable, or if storage paths aren't writable.

```
/fd:start "rate-limit the public API"      # spec from a topic
/fd:from-docs research.md ./adr NOTES.md   # spec from documents / URLs / dependent specs
```
Scaffold a new feature and build its spec through a grilling loop — `fd` drills the
gaps, ambiguities, and contradictions with you one at a time, materializing each
resolved decision as an ID-anchored element block. External claims are grounded as
they enter the spec. Ends by validating the spec against the Definition-of-Ready
and writing a bound `ready` / `blocked` verdict.

```
/fd:grill <slug>
```
Drill and change an existing spec (loop here as needed). Re-hashes, shows a
reconcile plan before writing anything, marks the affected tasks `stale`, and
re-validates. **Refuses** to touch an element already delivered to `main`, and
**blocks** re-grilling a feature whose implementation is already complete —
requirement changes after that belong to a new feature.

```
/fd:to-tasks <slug>
```
Projects the spec onto self-contained task files (one producer per element),
computes the acyclic dependency (SC) map, and validates the tasks to a `ready`
verdict. This is the **only** command that writes task files. **Refuses** if the
spec's DoR verdict isn't `ready` and current — it points you back to `/fd:grill`.

```
/fd:implement <slug>
```
Implements every ready task in dependency waves on a feature branch — each task in
an isolated worktree, squash-merged serially, gated by acceptance criteria + CI
scoped to the packages the wave touched, with one whole-feature code review at
feature close and a bounded self-healing repair loop. The first run asks which base
to branch off. **Resumable:** an interrupted session picks up the remainder of the
in-flight wave, salvaging completed-but-unmerged task branches instead of redoing
the wave. **Blocks** on any spec/task drift (sending you to `/fd:to-tasks`), if the
tasks' DoR verdict isn't `ready` and current, or if a consumed cross-feature
contract isn't delivered yet.

```
# self-review the feature branch (outside fd), then:
/fd:to-prs <slug>
```
Cuts the feature branch into a stack of PR branches for human review. **Blocks**
unless every task is implemented, and enforces a **buildability invariant** so each
PR in the stack depends only on PRs below it.

```
/fd:status <slug>
```
Read-only re-orientation — readiness verdicts (with staleness), task states, the SC
graph, the cross-feature program view, and which gates are open or blocked. Never
mutates anything; good for recovering the picture after compacting context.

## What it creates

In the default `per-feature` mode, each feature is a self-contained directory
(under `docs/features/<slug>/`); config lives once at the repo root:

```
.claude/fd-config.json     # written by /fd:config; the prerequisite every command checks

docs/features/<slug>/
  spec.md                  # the source of truth — elements as ID-anchored blocks
  state.json               # feature meta: phase, branch, readiness verdicts
  feature.lock.json        # manifest / ledger: element hashes, task records, commit SHAs (committed)
  ac-map.json              # AC → FR/NFR coverage (projection, computed by script)
  sc-map.json              # task dependency graph (projection, computed by script)
  sources-map.json         # provenance: each grounded claim → its source
  CONTEXT.md               # per-feature domain model
  sources/                 # copied source documents + web/ URL snapshots
  adr/                     # architecture decision records for this feature
  tasks/
    T-001.md               # self-contained task files, one producer per element
    T-002.md ...
```

A `shared` storage mode instead routes `CONTEXT.md` to a shared context root and
ADRs to a shared ADR root, keeping the spec/state/manifest/maps/tasks together
under a specs root. Where CONTEXT.md and ADRs live is decoupled from the storage
mode via the optional `storage.docs` block (`/fd:config` always asks) — e.g.
per-feature specs with a shared ADR root. See `examples/config.example.jsonc`.

## Key concepts

**Elements and anchored IDs.** The spec is a set of discrete *elements*, each a
Markdown block under a heading that carries a stable logical ID — `#### DB-3 —
Users table`, `### API-2 — …`, `## AC-5 — …`. The `KIND` prefix (`DB`, `API`,
`AC`, `FR`, `NFR`, …) doubles as a completeness checklist. IDs are allocated
append-only: never renumbered, never reused after a delete.

**Merkle content versioning + surgical staleness.** A dependency-free Node script
(never the model) hashes the normalized content of every element, rolls the hashes
up into a `specHash`, and folds each task's inputs (produced elements, consumed
contracts, covered ACs) into an `inputHash`. A task is stale exactly when its
recomputed `inputHash` differs from the stored one — so editing one element
invalidates only the tasks that actually consume it, and the cascade along the
dependency graph falls out for free. No separate propagation mechanism.

**Definition-of-Ready gates + waivers.** Two symmetric gates — spec → `/fd:to-tasks`
and tasks → `/fd:implement` — each governed by a set of binary checks run in a
clean-room subagent. A passing set writes a `ready` verdict **bound to the
artifact's hash**; any edit diverges the hash and makes the verdict stale (and thus
invalid). A failing check is a blocker; only a human waives one, consciously and
logged. Waivers live inside the verdict and die with it on the next hash change —
re-confirming a still-failing waiver takes one prompt, with no silent inheritance.

**Generated-only tasks.** Task files are projections you review but never hand-edit.
Each task's full normalized content is hashed into a `contentHash` in the manifest,
so a manual edit shows up as drift — and `/fd:implement` blocks on it, pointing you
back to `/fd:to-tasks` (the single owner of task-file writes).

**Waves, worktrees, squash-per-task.** `/fd:implement` computes implementation
waves as topological layers of the SC map on the fly (there is no materialized
plan). Each task runs in its own git worktree (driven by the shipped
`scripts/wave-implement.mjs` workflow script); tasks with overlapping file
footprints serialize, disjoint ones run in parallel. A dedicated merger subagent
squash-merges each passing task into the feature branch as exactly one commit
carrying a `Task: <id>` trailer — strictly serially, so there are no branch races.
The manifest records each task as it merges (not batched at wave close), and a
passing task leaves an empty `Fd-Gate: pass` breadcrumb commit on its worktree
branch — together these make an interrupted wave resumable: on re-entry, merged
tasks are skipped, gated-but-unmerged branches are re-checked and salvaged, and
only the rest re-runs.

**Stacked PRs + buildability.** The feature branch ends up as a linear,
one-commit-per-task history in topological order, so `/fd:to-prs` cuts a PR stack
that is just a **partition** of it — PR branches are pointers, and commit SHAs stay
identical (ship-detection keeps working). A buildability invariant guarantees every
task's dependencies sit at or below it in the stack, so you can review and merge
bottom-up.

**Cross-feature contracts.** One feature consumes another's element through a
versioned reference — `checkout#API-2@v2` (`#` = feature scope, `@vN` = contract
version). The consumed contract's content is copied into the consuming task inside
`fd:copy` markers, so drift is machine-locatable: a non-breaking upstream change
refreshes just the copied block (the copy-refresher subagent), while a `@vN` bump
forces a human re-point decision. `/fd:implement` additionally blocks until the
upstream element is actually delivered to `main`.

## Configuration

`/fd:config` writes and updates `.claude/fd-config.json`; the fully commented schema
is in [`examples/config.example.jsonc`](examples/config.example.jsonc), and the JSON
Schema that enforces it is in [`schemas/fd-config.schema.json`](schemas/fd-config.schema.json).
The knobs that most change behavior:

| Setting | Default | What it controls |
|---|---|---|
| `language.default` | `en` | Language of the spec and derived artifacts |
| `tasks.charsPerToken` | `4` | Token-estimator divisor; use `3`–`3.5` for densely tokenized languages (e.g. Polish) |
| `storage.mode` | `per-feature` | `per-feature` (everything in the feature dir) or `shared` (CONTEXT/ADRs in shared roots) |
| `storage.docs` | *(unset)* | Where CONTEXT.md/ADRs live, decoupled from `storage.mode`: `contextMode` (`per-feature` / `per-app` / `per-bounded-context`) + `contextFile` / `adrRoot` / `boundedContextsFile` |
| `tasks.maxContextTokens` | `40000` | Budget that caps a task's assembled size (file + copied deps); over budget forces a split |
| `implement.engine` | `workflow` | `workflow` (auto-falls-back to subagents when unavailable) or forced `subagents` |
| `implement.branchTemplate` | `feat/{slug}` | Feature branch name; the first `/fd:implement` run records the result |
| `implement.maxRepairIterations` | `3` | Failed repair iterations on one task before HIL escalation |
| `prs.model` / `prs.grouping` | `stacked` / `slice` | PR stack shape and how tasks group into PRs |
| `prs.baseBranch` / `prs.verifyPerPrCi` | `main` / `false` | Stack base; optional per-PR CI as a final gate |
| `validation.allowWaiver` | `true` | Set `false` to forbid overrides entirely (stricter, not looser) |
| `validation.dimensions` | full v1 sets | Per-dimension enable/disable for spec and task validation |

## Development

Golden tests cover the deterministic scripts (hasher, projections, token estimator,
schema migrations, JSON-Schema validation) with `node:test` and on-disk fixtures —
no dependencies:

```
node --test "plugins/fd/tests/"*.test.mjs
```

(Keep the glob quoted as shown so the shell passes the pattern to `node --test`.)

End-to-end promptfoo smoke evals exercise the LLM-driven commands against fixture
repos:

```
pnpm eval:fd
```

See [`evals/README.md`](evals/README.md) for the eval setup and scenarios.

To try the plugin from this checkout without installing it, load it in dev mode:

```
claude --plugin-dir plugins/fd
```

Command bodies reference plugin files via `${CLAUDE_PLUGIN_ROOT}`, which resolves
in both installed and `--plugin-dir` sessions. `scripts/wave-implement.mjs` is a
dynamic-workflow script executed by `/fd:implement` via the Workflow tool — never
run it with `node` (its trailing harness `return` is stripped by the unit tests
that import its pure helpers).

## Design docs & attribution

The full design specification (in Polish) lives in
[`docs/`](docs/) — `SPEC.md` is the backbone (core model, directory layout, ID
scheme, state files, gate architecture), with a per-command document alongside it
and `IMPLEMENTATION.md` for the plugin structure, artifact schemas, migration, and
test strategy.

The grilling methodology and the domain-model / ADR formats are inspired by
[mattpocock/skills](https://github.com/mattpocock/skills).
