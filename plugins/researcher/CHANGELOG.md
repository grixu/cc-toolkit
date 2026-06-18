# Changelog

All notable changes to the **researcher** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `research` orchestrator skill — gathers a brief (infer-first; one consolidated prompt over only the dimensions it
  can't infer: depth, recency, sources, audience), resolves the report folder (slugified goal; no index file — the
  per-report `state.json` files are the registry), launches the bundled Dynamic Workflow, presents the manifest +
  path, and runs the follow-up checkpoint that extends the evolving report.
- `workflows/research.js` — the bundled Dynamic Workflow:
  - **Setup** — loads a prior `state.json` when extending (with a `schemaVersion` guard), preflights `mmdc`.
  - **Plan** — derives distinct sub-query angles so parallel retrievers don't converge on the same hit.
  - **Assessor-gated round loop** — parallel firecrawl retrievers (WebSearch fallback) emit findings with typed,
    verbatim evidence spans and per-source trust tiers; deterministic dedup-by-URL assigns append-only source ids; a
    **Conflict-scout** (every round) and, on a deep brief, an adversarial **Verifier** feed the **Assessor**, the
    loop's single gate. Bounded by a per-depth round cap (quick=1 / standard=2 / deep=3), not a token budget.
  - **Synthesizer** — runs once on green light; reconciles findings, surfaces residual contradictions with
    attribution, composes an audience-neutral cited draft.
  - **Editor** — the sole audience-aware stage; re-cuts for concision and the brief's audience tier and marks
    earn-their-place visuals.
  - **Composer** — renders an HTML report (semantic HTML against a fixed class vocabulary), snapshots the prior
    version, copies the shipped assets, compiles diagrams, renders Chart.js charts, and writes `state.json`. Returns
    only the path + a compact manifest.
- Shipped assets — a version-pinned `chart.umd.js` (Chart.js 4.5.0) and a `report.css` (system fonts, light/dark,
  ~70ch column, sticky ToC sidebar, print styles), copied into each report so it stays offline and self-contained.
- Single **evolving** HTML report per topic with sidecar `diagrams/`, `assets/`, and `snapshots/` folders; source ids
  are append-only and content artifacts are written append-only so older snapshots keep resolving.

[Unreleased]: https://github.com/grixu/cc-toolkit
