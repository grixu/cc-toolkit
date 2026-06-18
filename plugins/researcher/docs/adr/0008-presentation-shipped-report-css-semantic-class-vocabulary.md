# Presentation: a shipped `report.css`; the Composer emits semantic HTML against a fixed class vocabulary

ADR-0007 settled the visuals and made the HTML body agent-readable. This settles the rest of the look —
and, more consequentially, *who authors it*: the **Composer fills a fixed presentation, it does not
design one**.

**The decision.** A single `report.css` ships with the plugin (like the pinned `chart.umd.js` of
ADR-0007), is copied into each report's `assets/`, and is linked relatively. The Composer authors **no
CSS**: it emits semantic HTML against a documented, fixed **class vocabulary** (`.toc`, `.citation`,
`.sources`, `.callout`, …). The visual language lives entirely in that stylesheet — a single centered
~70ch column, a **system font stack** (no web fonts, so no network), a modular heading scale, **light +
dark via `prefers-color-scheme`**, one discreet accent color, `[n]` citations as superscript anchor
links resolving to a numbered **Sources** list with back-refs, discreet `aside` callouts for the
assessor's Open questions and residual conflicts, and an `@media print` pass. The table of contents is a
`<nav class="toc">` emitted **first in source order**; CSS alone places it as a sticky sidebar on wide
viewports and reflows it to a top block on narrow screens and in print — the content column stays ~70ch
throughout.

**Why a shipped stylesheet, not Composer-authored CSS.** Three reasons, all flowing from ADR-0007's
principles:
- *Consistency* — every Report, and every snapshot of it, shares one identity; the look does not drift
  with the model's mood from run to run.
- *Agent-readability* — the `<head>` carries a one-line stylesheet link instead of a wall of bespoke
  `<style>`, and the body stays clean semantic HTML; an agent reads structure, not styling.
- *Cost* — the Composer spends no tokens inventing CSS; its job narrows from "design a document" to
  "fill a known structure."

This is the same trade we made for Chart.js: ship a fixed, pinned asset and hand the model the content,
not the presentation.

**Why pure CSS / no JS / no web fonts.** Citations, the Sources back-refs, dark mode, and the ToC
sidebar are all achievable with anchors, `prefers-color-scheme`, and `position: sticky` — no script. A
system font stack avoids a web-font fetch. Together this keeps the Report offline and self-contained
(ADR-0005, ADR-0007): it renders fully on a double-click with no network and no JS, degrading only the
Chart.js canvases (which carry a `<noscript>` data table).

**Why nav-first in source order.** What an agent — or any reader without the stylesheet — sees first is
*source order*, not visual position. Emitting the ToC `<nav>` first means it is read first everywhere,
while CSS is free to move it into the margin on wide screens.

**Trade-off accepted:** one visual identity for all reports — no per-report bespoke design (acceptable:
this is a research deliverable, not a brand surface). The class vocabulary becomes a contract that must
stay in sync between `report.css` and the Composer's instructions; we keep it small and version it with
the asset. Updating `report.css` re-styles existing snapshots that link it (they share the report's
`assets/`) — acceptable and usually desirable, since snapshots preserve *content*, not pixel-exact
styling.

**Consistent with ADR-0004** (the Composer renders the HTML — we constrain *how*), **ADR-0005**
(snapshots stay visually coherent under one shared stylesheet), and **ADR-0007** (same shipped-asset +
agent-readable pattern, extended from charts to styling).
