# Build a custom workflow instead of reusing the built-in /deep-research

Claude Code ships `/deep-research`, a built-in Dynamic Workflow that fans out WebSearch, cross-checks
sources, and returns a cited report — roughly 80% of this plugin's job. We build our own anyway.

**Why:** we need control the built-in black box doesn't expose — (1) **firecrawl-backed retrieval**
(full-page scrape/extract) rather than WebSearch snippets; (2) a **tailored interactive brief**
before the run; (3) **control of the research loop** (round count and stopping criteria) to raise
resolution; and (4) room for **additional retrievers** (Perplexity, Gemini deep research) alongside
firecrawl, behind the same report contract.

**Trade-off accepted:** more to build and maintain, plus a hard dependency on Dynamic Workflows
(Claude Code v2.1.154+, paid plan; off by default on Pro). Fine for an internal team tool — the
README states the requirement.

**Mechanism (validated):** the workflow `.js` is bundled in the plugin and passed as an inline
`script` string to the `Workflow` tool by the orchestrator skill. The joke-fanout experiment proved
skill→workflow launch, 5-way firecrawl fan-out, and a structured-output citation schema.
