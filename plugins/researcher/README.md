# researcher

A Claude Code plugin that answers a research question with a **source-grounded, cited HTML report**.

An interactive front-end skill gathers a brief (depth, recency, source mix, audience), then launches a bundled
**Dynamic Workflow** that fans out **firecrawl** retrieval subagents into **findings** — each carrying a verbatim
**evidence span** — gates rounds on coverage and contradictions, synthesizes a single cited answer where every claim
traces to a numbered source, and renders it as an HTML report. Follow-up questions **extend the same report** rather
than spawning a new file each time.

## ⚠ Requirements

This plugin depends on capabilities that are **not on by default** — read this before installing.

- **Dynamic Workflows** — Claude Code **v2.1.154+**, on a **paid plan**. They are **off by default on Pro** (enable
  per-session) and available on Max. The whole retrieval pipeline runs inside a workflow so its large, verbose
  intermediate output stays out of your main session. If the `Workflow` tool isn't available, the skill stops and
  asks you to enable it — it will not silently degrade.
- **firecrawl MCP** — install the firecrawl MCP server and set `FIRECRAWL_API_KEY`. Because background workflow
  subagents auto-deny permission prompts, the firecrawl tools must be **allow-listed**. Add to your settings:

  ```json
  {
    "permissions": {
      "allow": [
        "mcp__firecrawl__firecrawl_search",
        "mcp__firecrawl__firecrawl_scrape"
      ]
    }
  }
  ```

  (WebSearch is used as an automatic fallback when firecrawl errors or a site is unsupported.)
- **`mmdc`** *(optional — for diagrams)* — the Mermaid CLI, used to compile diagrams to SVG at compose time. Install
  globally with `pnpm add -g @mermaid-js/mermaid-cli`. If it's missing, the workflow falls back to `pnpm dlx` / `npx`,
  and if neither is available it renders the report **without diagrams** (with a note) rather than failing.
- **Charts need no install** — a version-pinned **Chart.js** ships with the plugin and is copied into each report's
  `assets/` (no CDN, fully offline).
- **Styling is built-in** — a shipped `report.css` is copied alongside (system fonts, light/dark via CSS, no theming
  setup, offline). No configuration required.

## Installation

From the `grixu/cc-toolkit` marketplace:

```
/plugin marketplace add grixu/cc-toolkit
/plugin install researcher
```

## Usage

```
/researcher:research "How does HTTP/3 differ from HTTP/2 in practice?"
/researcher:research "Porównaj bazy wektorowe pod kątem produkcyjnym"
```

The skill infers as much of the brief as it can from your question and asks — in a **single** prompt — only about
the dimensions it can't confidently infer:

- **Depth** — Quick (1 round) · Standard (2 rounds) · Deep (3 rounds + an adversarial Verifier pass)
- **Recency** — Recent (~2 years) · Any · Latest (fast-moving)
- **Sources** — Broad · Authoritative (primary + reputable) · Technical-academic (docs/standards/papers)
- **Audience** — Lay · Informed · Practitioner · Expert (calibrates the writing only)

The **report language follows your question** (an explicit "…in English" / "…po polsku" in the question overrides it).

When the run finishes, the skill prints a short manifest (title, sections, source/round counts) and the path to the
report, and offers to open it. It then shows ready-to-use **follow-up questions**: pick any (or add your own) and the
report is deepened in place.

## The report

Each report is a folder (default `./research/<slug>/`):

```
research/<slug>/
├── output.html          # the live report — open this
├── state.json           # machine-readable state (sources, findings, answer) for follow-up runs
├── assets/              # shipped report.css + pinned chart.umd.js (+ any downloaded source images)
├── diagrams/            # compiled diagram SVGs beside their .mmd sources
└── snapshots/           # the prior output.html, snapshotted before each overwrite
```

- **One linear, cited document.** Inline `[n]` citations link to a numbered **Sources** list (with trust tiers and
  access dates); nothing is hidden behind toggles. Light + dark via `prefers-color-scheme`, system fonts, prints cleanly.
- **Visuals only where they earn their place.** Quantitative data → Chart.js charts (with a `<noscript>` data table);
  flows/relationships → Mermaid diagrams compiled to SVG; comparisons → HTML tables. Reconstructed from the findings;
  a source image is downloaded only when it's genuinely irreplaceable (and always attributed).
- **Agent-readable.** The HTML body stays semantically clean — heavy artifacts live in the sidecar folders — so the
  report is just as usable when an agent reads it as documentation.
- **It evolves.** Follow-up runs re-synthesize the whole answer holistically and snapshot the prior version first;
  source ids are append-only, so existing citations never break.

## How it works

```
brief → [ Dynamic Workflow ] → output.html
            plan distinct sub-queries
            ↓  (assessor-gated rounds)
            parallel firecrawl retrievers → findings (verbatim evidence spans)
            → Conflict-scout → (deep: Verifier) → Assessor (the single gate)
            ↓  on green light
            Synthesizer (once) → Editor (audience) → Composer (HTML)
```

The Assessor decides whether to run another round (bounded by a per-depth round cap, not a token budget). On a deep
brief, a Verifier adversarially challenges material findings. The Synthesizer composes an audience-neutral cited draft;
the Editor cuts it for concision and the chosen audience and marks earn-their-place visuals; the Composer renders the
HTML and returns only the path + manifest.

## Notes

- Research is token-heavy by nature (many retrievers, several reasoning stages). Those tokens stay **inside the
  workflow**, not in your main session. Quick/standard/deep trade thoroughness for cost.
- The guarantee is **"the source says this," not "this is true"** — fidelity is enforced structurally via verbatim
  evidence spans; deep briefs add adversarial verification on top.
- `reddit.com` and some walled sites aren't scrapeable; the retriever falls back to search snippets or alternatives.
