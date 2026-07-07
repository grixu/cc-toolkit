# Changelog

All notable changes to the `fd` plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial implementation of feature-delivery v2 from the spec set in `docs/`:
  eight commands (`/fd:config`, `/fd:start`, `/fd:from-docs`, `/fd:grill`,
  `/fd:to-tasks`, `/fd:implement`, `/fd:to-prs`, `/fd:status`), five subagents
  (researcher, analyst, validator, copy-refresher, merger), shared reference blocks,
  dependency-free Node.js scripts (hasher, projections, token estimator,
  schema migrations), JSON Schemas for all workspace artifacts, golden tests,
  and promptfoo e2e smoke evals.
- `scripts/wave-implement.mjs` — shipped dynamic-workflow engine for `/fd:implement`
  waves (defensive args parse, serialization batches, per-task result schema,
  task-agent contract with the `Fd-Gate: pass` breadcrumb), with unit tests for its
  pure helpers.
- Optional `storage.docs` config block decoupling where CONTEXT.md/ADRs live from
  `storage.mode`; `/fd:config` now always asks and records the docs location.
- `analyst` subagent owning `/fd:from-docs` analysis extraction (researcher stays
  grounding/snapshots-only).

### Changed (after first field tests via `--plugin-dir`)

- All command bodies reference plugin files via `${CLAUDE_PLUGIN_ROOT}` (the
  previously used `${CLAUDE_SKILL_DIR}` is skill-scoped only and stays unset in
  commands), with a one-probe guard against filesystem hunts for plugin files.
- `/fd:implement` first-run feature branch: adopts the branch the user already
  prepared (cut from `prs.baseBranch` and up to date with it) with no question
  asked; the base-branch HIL runs only otherwise; manifest written
  incrementally per merged task (single writer preserved); interrupted waves resume
  their remainder and salvage gated-but-unmerged task branches instead of
  cold-restarting; per-wave CI scoped to touched packages (full-repo fallback);
  code review moved from per-wave to a single whole-feature pass at feature close
  (diff passed by file path, no nested fan-out, no network research);
  `impl.commits` re-resolved from `Task:` trailers after every autosquash;
  deterministic read-after-write footprint pre-pass plus a stub-not-recreate rule
  for task agents.
- `/fd:to-tasks`: task frontmatter contract documented (`---` on line 1, flat
  inline YAML); post-wave `estimate-tokens.mjs` size gate on every assembled file;
  generation batches and validators dispatched in one parallel message; per-batch
  spec extracts instead of N full-spec reads; `codeDeps` must be real verified
  repo paths.
- Validation tails: validator doubts split into blocking vs advisory; re-runs
  scoped to dimensions whose elements changed; `self-contained` dimension gets a
  regex pre-scan before full reads.
- `/fd:config`: mechanizable skill-invocability check with canonical skill ids;
  MCP/engine detection defined concretely (session tool namespace, no shell
  probes); non-conditional questions batched into one AskUserQuestion with
  defaults surfaced in the report and model-chosen non-defaults flagged.
- Fan-out orchestration: commands await subagent completions directly (no
  foreground `sleep`, no filesystem polling); references loaded at point of use
  (`CROSS_FEATURE.md` only when upstreams are consumed).
- Spec-quality: compact AC template (trigger → one observable outcome, no vague
  verbs, mandatory `covers:`) in GRILLING/BUILDING_SPEC references and docs.
- Element-kind seed dictionary spelled out in full words: `CFG`→`CONFIG`,
  `OBS`→`OBSERVABILITY`, `INF`→`INFRASTRUCTURE`, `INT`→`INTEGRATION`,
  `MOD`→`MODULE`; the anchor-grammar KIND length ceiling widened from 10 to 16
  uppercase letters (hasher regex, JSON-schema patterns, fixtures).
- `tasks.maxContextTokens` default raised from `40000` to `250000` (targets
  models with a ≥512k context window, e.g. Opus 4.8); `/fd:config` now asks for
  the task context budget explicitly (250k / 120k / 40k options) instead of
  silently defaulting it.

### Added (after second field tests)

- Shipped state-writer scripts — commands never hand-assemble state JSON anymore:
  `scripts/build-manifest.mjs` (sole projector of `feature.lock.json`: seed,
  elements + producers, append-only `idCounters`, `spec.history`, delivered-drift;
  refuses on `unknownKinds`; `--refresh-task-hashes` guards the staleness baseline),
  `scripts/apply.mjs` (verdict/transition applier: `seed-state`, two-phase task apply
  `fill`/`finalize`, `readiness-spec`, `reconcile` with the HIL-gated `@v` bump;
  `validatedHash` always computed fresh, never hand-typed), `scripts/record-impl.mjs`
  (surgical implement/ship patcher: `record`/`ship`/`phase`, zero hash recompute),
  plus `scripts/lib/json-io.mjs` and `scripts/lib/frontmatter.mjs` (comment-preserving
  surgical frontmatter writer). Golden tests for all five.
- `hasher.mjs` now reports `malformedAnchors` — headings that attempt the anchor form
  but fail the grammar (over-long KIND, leading zero, wrong dash) used to vanish
  silently; commands treat them like `unknownKinds` (HIL).
- `implement.ciScope` config knob (`full` default | `scoped`) — per-wave CI scope;
  feature close always runs the full pipeline.

### Changed (after second field tests)

- `/fd:implement` engine rebuilt around **one full-cycle Workflow run**: waves computed
  in-script from task `deps`, per-wave serial worktree prep, task agents, one merger
  call per wave, CI with exit-code reconciliation, a bounded repair loop (worktree
  repairs parallel; merged-code repairs as one serial feature-branch fixup agent), and
  the whole feature close (full CI → code review via Skill tool → mechanical fixes →
  autosquash → final CI) inside the same run. Returns are discriminated:
  `completed` / `continue` (internal agent budget → auto-relaunch, no HIL) /
  `escalated` — only `architectural` spec gaps, `repair-exhausted`, `cr-judgment`
  findings, and `engine-failure` reach the human. State stays main-thread-written at
  run boundaries, re-resolved from `Task:` trailers via `record-impl.mjs`.
- `/fd:implement` branch adoption narrowed to **freshly cut branches only**
  (`git rev-list --count <base>..HEAD` == 0); a branch carrying its own commits (e.g.
  a PoC) now goes through HIL with an explicit adopt option; a name collision with an
  existing `<branchTemplate>` branch or stale `fd/<slug>/*` residue is a new HIL
  instead of undefined behavior.
- `/fd:to-tasks`: two-phase apply — `apply.mjs fill` writes real `builtAgainst` hashes
  **before** the validators (kills the systematic false blocking doubt on the
  `sha256:pending` placeholder, now the documented generation-time standard);
  `apply.mjs finalize` executes the verdict transition. Dead symbols are
  auto-classified by the validator (advisory unless marked blocking) and must be
  surfaced in the report; blocking doubts are always a human question. Batch prompts
  now carry the full `T-ID → title` map (sc-integrity verifies every referenced task
  id exists), extracts must be complete and are the batch's ONLY material, and the
  size gate runs after each generation layer.
- `covers:` is now explicitly FR/NFR-only (never contract elements) in
  BUILDING_SPEC, GRILLING, and the analyst contract — field run put contract ids
  there and the ac-map projection rejected the spec.
- `/fd:config`: skill invocability is judged from the **session's available-skills
  list** (disk `SKILL.md` only for `disable-model-invocation`); the worked example no
  longer brands plugin==skill doubled ids (`quality-review:quality-review`) as wrong —
  they are the canonical form for such plugins; the storage-mode question owns the
  `featuresRoot` path explicitly so it stops leaking into the docs-location answer.
- Fan-out dispatch wording hardened everywhere: ALL subagents of a fan-out go in ONE
  message (one-per-message serializes the fan-out in standard harnesses).
- `merger` agent: invoked once per wave with the ordered passing list, returns a
  structured JSON result for the engine, and executes the worktree-cleanup policy;
  still write-free (recording happens from trailers in the main conversation).

### Added (after third field tests)

- `scripts/build-sources-map.mjs` — the sole writer of `sources-map.json`: merges and
  dedupes complete provenance records from plain JSON data files, schema-validates before
  writing, `--seed` scaffolds an empty map. Replaces the one-off 21k-char builder the
  round-3 field run hand-wrote inline in the main thread. Golden tests included.

### Changed (after third field tests)

- Every command opens with a shared **Script contract** block: shipped scripts are
  executed via their documented one-liners (stdout JSON is the whole interface; a wrong
  invocation prints a usage error, which is the documentation), source is read only to
  diagnose an execution that already failed, and no shipped script is ever re-implemented
  inline.
- `/fd:from-docs` analyst fan-out hardened into a dispatch protocol: finalize the full
  slice list first, then ONE message carrying every analyst call; partial dispatch is a
  contract violation and narration must match the real message shape (the round-3 run
  dispatched 6 analysts as 2+2+2 while claiming a single message); filesystem polling
  over `analysis/` while agents run is explicitly banned.
- `/fd:from-docs` grounding records: the grill accumulates complete records
  (`claim`/`fact`/`quote`/`source`/`anchors`/`groundedAt`) and persists them in one
  `build-sources-map.mjs --records` call at Persist — `sources-map.json` is never edited
  by hand mid-grill.
