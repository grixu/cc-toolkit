# Changelog

All notable changes to the **researcher** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-06-22

### Added

- `research` orchestrator skill — gathers a brief (infer-first; one consolidated prompt over only the dimensions it
  can't infer: depth, recency, sources, audience), resolves the report folder (slugified goal; no index file — the
  per-report `state.json` files are the registry), launches the bundled Dynamic Workflow, presents the manifest +
  path, and runs the follow-up checkpoint as a structured **`AskUserQuestion`** (multiSelect — each proposed follow-up
  is a selectable option, full text in the description) that extends the evolving report.
- `workflows/research.js` — the bundled Dynamic Workflow:
  - **Setup** — creates the report dir and, when extending, loads only the prior report's `state.json` HEAD (with a
    `schemaVersion` guard) — no read-back swarm; the prior findings stay on disk and the Synthesizer reads them later.
    Tool availability (`mmdc`) is detected by the skill up front and passed in args, not preflighted here.
  - **Plan** — derives distinct sub-query angles so parallel retrievers don't converge on the same hit; when the goal
    hinges on a named product/vendor/standard's capability, it dedicates a primary/official-docs angle so "does X
    support Y" is confirmed at the source rather than inferred from third-party threads.
  - **Assessor-gated round loop** — parallel firecrawl retrievers (WebSearch fallback) emit findings with typed,
    verbatim evidence spans and per-source trust tiers; deterministic dedup-by-URL assigns append-only source ids; a
    **Conflict-scout** (every round) and, on a deep brief, an adversarial **Verifier** feed the **Assessor**, the
    loop's single gate. Bounded by a per-depth round cap (quick=1 / standard=2 / deep=3), not a token budget. The
    Assessor treats a central capability claim that rests only on secondary/community sources or inference as a
    **material, resolvable gap** — it sends the next round to that actor's own primary docs instead of green-lighting
    on inference, and a deep brief holds a high bar — so a single round can't settle "does X support Y" by guessing.
  - **Synthesizer** — runs once on green light; reconciles findings, surfaces residual contradictions with
    attribution, composes an audience-neutral cited draft. On a follow-up it reads the prior findings shards
    directly (`Read`, batched in one turn) and rebuilds the whole answer from all findings holistically — never
    seeded by the prior prose (`answer.md` is a write-only export).
  - **Editor** — the sole audience-aware stage; re-cuts for concision and the brief's audience tier and marks
    earn-their-place visuals.
  - **Persist** — runs before the render: snapshots the prior `output.html`, then writes state append-only as a
    small `state.json` HEAD plus bounded `findings/NNN.json` shards (≤20 findings each) and `answer.md`, each in its
    own `Write` so no single agent turn ever emits the whole corpus — the failure mode that aborted large/deep runs.
    On extend, this run's new findings are appended as **new** shards at indices continuing from the prior
    `shardCount` (prior shards are never cleared or rewritten; the HEAD counts accumulate); `findings/` is cleared
    only on a fresh run.
  - **Composer** — renders an HTML report (semantic HTML against a fixed class vocabulary), copies the shipped
    assets, compiles diagrams with a **global `mmdc`** (it never reads `report.css`, explores the dir, or downloads a
    renderer — going straight to the render so it can't look hung), and renders Chart.js charts (state is already
    persisted). Returns only the path + a compact manifest.
- Shipped assets — a version-pinned `chart.umd.js` (Chart.js 4.5.0) and a `report.css` (system fonts, light/dark,
  ~70ch column, sticky ToC sidebar, print styles), copied into each report so it stays offline and self-contained.
- Single **evolving** HTML report per topic with sidecar `diagrams/`, `assets/`, `snapshots/`, and `findings/` (sharded
  state) folders; source ids, findings shards, and content artifacts are all written append-only — follow-up runs add
  new shards rather than rewriting prior ones, so older snapshots keep resolving and existing citations never break.

[Unreleased]: https://github.com/grixu/cc-toolkit
