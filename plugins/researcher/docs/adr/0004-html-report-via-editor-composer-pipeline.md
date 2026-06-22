# Render the result as an HTML report, composed in-workflow by an Editor→Composer pipeline

The result could ship as Markdown (the agent default) or as HTML; and if HTML, as one self-contained
file or as a referenced sidecar bundle. We render **HTML with a sidecar** — `output.html` referencing
`diagrams/*.svg` and `assets/*.png`, with the `.mmd` sources kept under `diagrams/` — produced by a
two-stage pipeline at the end of a workflow run: an independent **Editor**, then the **Composer**.

**Why HTML:** Markdown padding ("lanie wody") and jargon-soup were the top complaints. HTML lets us
lead with a tight answer and carry tables, charts, SVG diagrams, and selected source images — richer
and far more likely to actually be read (cf. the Claude Code team's "unreasonable effectiveness of
HTML").

**Why a separate Editor:** concision and readability are a writing problem, so a dedicated Editor
cuts filler, de-jargons for the brief's **audience**, and marks where a visual earns its place —
independent eyes, not the renderer self-grading. The Composer then renders only what survived, adding
no visuals of its own and reconstructing them from the Findings rather than copying source images
unless a visual is irreplaceable.

**Why sidecar over self-contained:** chosen for clean separation and swappable single assets,
accepting the loss of the blog's "one link to share" — sharing means the folder, and a moved
`output.html` loses its graphics.

**Trade-off accepted:** more machinery than a Markdown dump, a dependency on `mmdc` for diagram
compilation (a preflight check degrades gracefully — report without diagrams, with a note — rather
than failing the run when `mmdc` is absent), and a deliverable that is a folder rather than a single
file. Consistent with ADR-0001: the Composer runs subagent-side and returns only the artifact path
plus a short manifest, so the verbose HTML never enters the main context.

**Validated:** a capability probe (run `wf_dc7415c4-1c9`) confirmed a workflow subagent can run Bash,
write files to disk, compile `.mmd`→`.svg` with a **global** `mmdc` (v11.12.0, no headless-Chromium
config needed on this host), and fetch images with `curl`. Portability caveats: a host without
`mmdc` on `PATH` falls back to `npx -y @mermaid-js/mermaid-cli` (bundled Chromium) — the reason the
preflight degrades gracefully — and image fetches need stable URLs with a retry/fallback chain
(httpbin and some raw URLs were flaky in the probe, so a failed fetch skips the image with a
captioned note rather than aborting the run).
