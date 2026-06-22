# Vendored assets

These files ship with the plugin and are copied verbatim into each report's `assets/`
folder by the Composer (relative-linked, never CDN). See ADR-0007 and ADR-0008.

## chart.umd.js

- **Library:** Chart.js (UMD build, self-contained — bundles its dependencies)
- **Version:** 4.5.0 (pinned; the version banner is preserved inside the file)
- **Source:** https://cdn.jsdelivr.net/npm/chart.js@4.5.0/dist/chart.umd.js
- **License:** MIT (banner retained at the top of the file)
- **Why pinned:** an immutable copy keeps every report snapshot coherent (ADR-0009).
  Do not re-minify or edit — replace wholesale to bump the version.

## report.css

- Authored in-repo (no upstream). The fixed class vocabulary it defines is a contract
  kept in sync with the Composer's instructions in `workflows/research.js`.
