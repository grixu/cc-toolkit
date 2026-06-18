# Quantitative charts via vendored Chart.js; diagrams via mmdc SVG; the Report stays agent-readable

We settled how the **Composer** turns the answer's visuals into the HTML **Report**, and what keeps
that HTML usable not only by a human in a browser but by an *agent* reading it as documentation — which
is how the Report will almost always be consumed.

**The split.** Diagrams (flowchart / sequence / ER) are compiled to **SVG with mmdc** at compose time,
written to `diagrams/` (beside their `.mmd` sources), embedded via `<img>`, each preceded by an HTML
comment pointing to its `.mmd` source. Quantitative charts (bar / line / pie) use **Chart.js**: a
version-pinned copy vendored into `assets/`, a `<canvas>` plus a compact, readable `data` config, and a
`<noscript>` `<table>` of the same numbers. Visuals therefore render two ways — diagrams **compile-time** (static
SVG), charts **view-time** (Chart.js in the reader's browser).

**Why Chart.js for quantitative charts.** The alternatives were Mermaid's `xychart-beta` (same mmdc
toolchain, but beta and limited — no grouped/stacked, weak styling), Vega-Lite → SVG (real charts, but a
second build CLI), and the Composer hand-writing inline SVG (no dependency, but an LLM drawing data
mis-scales axes and proportions — the exact failure the product's fidelity-by-construction forbids).
Chart.js wins on the product's core axis: the Composer emits the source numbers as a `data` array and
the library does the scaling, axes, and proportions deterministically, so a chart is faithful *by
construction* — the same guarantee an evidence-span `quote` gives a citation. It is also the charting
library coding agents write most reliably, so the Composer produces correct config far more often than
it would `xychart-beta` syntax or a Vega-Lite spec. We do not trust the model to *draw* data any more
than to *cite* it; Chart.js lets us hand it the numbers and not the pixels.

**Why vendored, not CDN, not inline.** A CDN `<script>` would make the Report need the network to show
charts — breaking the single, shareable, offline artifact (ADR-0005) and freezing a dependency on an
external host into every snapshot. Inlining the ~70 KB minified library into the HTML would bury the
body in noise — unacceptable because the Report is routinely read by agents as documentation and that
body must stay scannable. So we vendor a **pinned** copy into `assets/` (per report, relative link):
offline *and* self-contained *and* clean-bodied. The version pin keeps the asset immutable, so the
snapshots ADR-0005 takes stay coherent.

**Why diagrams stay compile-time SVG.** Symmetry would push diagrams to client-side Mermaid too, but the
`mermaid.js` browser bundle is ~2.8 MB — far too heavy to vendor into every report (and every snapshot).
A compiled SVG is tiny, static, and renders where a chart `<canvas>` cannot (email previews, PDF print,
GitHub blob view). Diagrams therefore keep the ADR-0004 compile-time path; only charts move view-time,
where Chart.js's data-fidelity and config-reliability earn the JS dependency.

**The agent-readability principle (new, cross-cutting).** The Report is consumed *as documentation by
agents* on ~99% of runs, not merely opened by a human. That promotes "the HTML body stays semantically
readable" to a first-class constraint rather than a nicety, and it is what drove three of the choices
above: vendored-over-inline (no minified-JS wall in the body), the `<noscript>` data table (the numbers
survive without executing JS), and the HTML-comment pointer to each diagram's `.mmd` source (a reading
agent gets ~10 lines of Mermaid instead of SVG path-coordinate soup). The rule generalizes: heavy
artifacts go to the sidecar folders (`diagrams/`, `assets/`); the body keeps only references and
semantic pointers.

**Trade-off accepted:** the Report is no longer 100% "dead" static HTML (charts need a JS-capable
viewer) nor literally a single file — it is an HTML document plus sidecar folders: `diagrams/` (compiled
SVGs beside their `.mmd` sources) and `assets/` (the pinned chart library and any irreplaceable images).
The `<noscript>` table and the inline-`<img>` SVG diagrams keep the essential content visible without
JS; the sidecars are the price of offline + clean-body. We also accept **two visual toolchains** (mmdc +
Chart.js) in exchange for each rendering where it is strongest.

**Consistent with ADR-0004** (HTML report + sidecar, composed by Editor → Composer — we specify how its
visuals are produced) and **ADR-0005** (single evolving Report, snapshotted — the pinned, immutable
`assets/` keep those snapshots coherent).
