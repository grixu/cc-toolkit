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
- `/fd:implement`: permanent base-branch HIL on first run; manifest written
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
