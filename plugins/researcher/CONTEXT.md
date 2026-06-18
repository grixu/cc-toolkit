# Researcher

A Claude Code plugin that answers a research question with a **source-grounded, cited report**.
An interactive front-end skill gathers the brief, then launches a bundled Dynamic Workflow that
fans out firecrawl-backed retrieval subagents (WebSearch fallback) into findings, gates rounds on
coverage and contradictions, then synthesises a cited answer where every claim is traceable to a
numbered source — rendered as an HTML report.

## Language

**Research brief**:
The structured spec the front-end skill produces from the user's question and answers — the goal
plus scope, depth, recency, source, and **audience** constraints. It is what drives a workflow run.
The **audience** is one of four coarse expertise tiers — `lay`, `informed`, `practitioner`, or
`expert` (`practitioner` = in the field but junior: knows the basics, not advanced terms or
abbreviations) — optionally refined by a one-line free-form descriptor (e.g. "a PM evaluating vendors"). It calibrates the
**Editor** *only* (no other stage reads it); the skill infers the tier from the question and available
context (e.g. a global CLAUDE.md), and only asks the user outright when it cannot.
_Avoid_: query, prompt

**Source**:
A web resource (URL) discovered during retrieval, deduplicated by URL and assigned a stable
**numeric id** used for citation, plus a coarse **trust tier** — `primary/official` >
`reputable-secondary` > `community/unverified` — set by the **Retriever** at fetch. The tier lets the
**Assessor** dismiss noise conflicts (official docs vs a stale blog) without a round, the
**Synthesizer** weigh sources when reconciling, and the **Report's** Sources list show the reader the
basis. Corroboration (how many independent sources back a finding) is a further, emergent signal — not
a substitute for the tier. Ids are append-only across the evolving **Report**: follow-up runs add new
sources with new ids and never renumber existing ones, so inline citations stay valid.
_Avoid_: link, reference

**Finding**:
A discrete claim extracted from one or more sources, tagged with the source ids it came from *and* a
typed **evidence span**. Each span has a `kind`: a `quote` (verbatim source text — the default, and the
only kind a cheap deterministic string-check against the scrape can confirm), an `image_region` (url +
alt/caption, for charts and infographics), or a `locator` (page/timestamp + the retriever's paraphrase,
for paywalled or non-text sources). Non-text kinds are explicitly **non-verbatim**, so the fidelity
guarantee degrades *visibly* rather than silently — a `quote` is audited by construction; anything else
announces that it isn't.
_Avoid_: result, fact

**Report**:
The deliverable — an HTML document backed by two sidecar folders, `diagrams/` (`.mmd` sources +
compiled SVGs) and `assets/` (the vendored chart library, the shipped `report.css`, and any
irreplaceable images), carrying the stated **goal**, a numbered list of **sources**, and an **answer** whose claims cite source ids inline
(e.g. "… happened in 2024 [2][5]"). Its body is kept readable by humans *and* agents — it is routinely
consumed as documentation, so heavy artifacts go to those sidecars and the body keeps only their
references and semantic pointers. It evolves across follow-up runs rather than spawning a new file each time: every
run merges its new **Findings** and the **Editor** re-cuts the whole **answer**, so the document stays
concise as it grows. The prior file is snapshotted before each overwrite.
_Avoid_: summary, output

**Research round**:
One pass of plan → parallel retrieval → extract → dedup (by URL, assign append-only ids) →
**conflict-scout** (a *deep* brief inserts a **Verifier** pass next). Merge is *not* a per-round step —
it is deferred to the **Synthesizer**, which runs once after the **Assessor** green-lights coverage.
Rounds run in two tiers: *within* a workflow run the
**assessor** gates them autonomously; *between* runs the user steers via follow-up questions. Bounded
by a hard round cap per depth — *not* a token budget (Claude Code does not reliably expose one). Both a
**Conflict-scout** conflict and a **Verifier** refutation that needs fresh evidence become gaps filled
by the *same* round retrieval — there is one information-pulling mechanism, not several.
_Avoid_: iteration

**Retriever**:
A workflow subagent that fetches from an external source. Today: **firecrawl** (search/scrape),
with **WebSearch** as fallback. Designed to admit more retrievers later (Perplexity, Gemini deep
research) without changing the report contract. Alongside text, a retriever records **candidate
image URLs** from each page (so the Composer can later fetch the ones worth including) and assigns each
**Source** its coarse **trust tier** at fetch.
_Avoid_: scraper, crawler, fetcher

**Assessor** (coverage assessor):
The loop's single gate. A subagent that, after a round, judges whether more research is needed —
weighing subject complexity, accumulated context size, explicit user intent (a "deep research" brief
biases toward more rounds), the **Conflict-scout's** `conflicts[]`, and — on a deep brief — the
**Verifier's** unresolved refutations. It judges each conflict's/refutation's **materiality** against
the brief's goal and planned sub-questions (a material, resolvable one is itself a gap). It green-lights
only when coverage is sufficient *and* no material, resolvable conflict or refutation remains;
otherwise it emits the gaps plus proposed follow-up questions.
_Avoid_: evaluator, critic

**Conflict-scout**:
A subagent that runs each round after dedup, *before* the **Assessor**: it diffs the accumulated
**Findings** for contradictions and emits `conflicts[]`, each tagging the clashing finding/source ids
with a *hint* at whether it is resolvable by more retrieval. **Materiality is not the scout's call** —
the **Assessor** judges it against the brief's goal and planned sub-questions (no drafted answer exists
yet). The scout only detects — it neither gates the loop (the **Assessor** does) nor writes prose (the
**Synthesizer** does), and it compares claims against *each other*, not ground truth, so it is no
fact-checker.
_Avoid_: verifier, fact-checker, referee

**Verifier**:
A depth-gated adversarial subagent — runs only on a *deep* brief, each round, after the
**Conflict-scout**. It tries to *refute* the material **Findings**, reasoning over the already-gathered
corpus (other findings, source **trust tiers**, internal logic) — it does **not** fetch itself. A
finding it can refute outright is dropped; one it cannot settle without fresh counter-evidence becomes
a gap the **Assessor** acts on (filled by an ordinary round, the same mechanism conflicts use). It
judges *truth/reliability*, where the **Conflict-scout** judges only mutual *consistency*. Quick and
standard briefs skip it.
_Avoid_: fact-checker, skeptic, critic

**Synthesizer**:
The reasoning core. A subagent that runs **once**, only after the **Assessor** green-lights coverage:
it reads the full deduplicated **Findings** and **Sources**, reconciles findings where they can be
reconciled, surfaces with attribution the residual contradictions the **Conflict-scout** flagged as
irreducible (it never hides them), and composes the structured draft **answer** with inline `[id]`
citations. It composes **audience-neutral** — the full, faithful argument with all its nuance and
caveats, never pre-trimmed for a reader; adapting it to the brief's audience is the **Editor's** job.
Turning gathered claims into a coherent, cited argument is its work — distinct from the **Editor**,
which adapts that draft to the reader and cuts and clarifies it afterward. On a follow-up run it
re-synthesizes the *whole* answer from the accumulated findings (holistic, per ADR-0005), not just the
new material.
_Avoid_: writer, merger, aggregator

**Editor**:
A subagent that adapts the draft **answer** to its reader before it is rendered — the **sole
audience-aware stage**. Guided by the brief's audience tier (`lay` / `informed` / `practitioner` / `expert`) it sets how
much jargon to define, how much prior knowledge to assume, and how dense to write: for `lay` it defines
terms inline, leads with intuition, and cuts expert-only nuance; for `informed` it assumes general
literacy but defines field-specific terms; for `practitioner` it assumes the basics yet still defines
advanced terms and expands abbreviations on first use; for `expert` it assumes the terminology (jargon
and abbreviations), trims background, and foregrounds caveats and edge cases. Throughout it adversarially cuts
redundancy and filler — without flattening the **Findings'** accuracy. It also marks where a visual (a
Mermaid diagram, table, or chart) would carry an idea better than prose — leaning on more of them for a
`lay` reader, fewer for an `expert` — and specifies what it should show, so the **Composer** renders
only visuals that earn their place. Independent of
whoever drafted the answer, so the cutting is a second pair of eyes, not self-grading.
_Avoid_: proofreader, summarizer

**Composer**:
The final stage of a workflow run — a subagent that renders the editor-approved **answer** as the
HTML **Report**: it builds the linear document (table of contents + anchors) and keeps the HTML body
**readable by humans and agents alike** — heavy artifacts live in the sidecar `diagrams/` and `assets/`
folders and the body carries only their references, since the Report is itself read as documentation.
It does not design: the body is semantic HTML against a fixed class vocabulary, styled by a shipped
`report.css` (copied into `assets/`, linked relatively), so every Report and snapshot shares one
identity and the head carries no bespoke `<style>`.
Mermaid diagrams the Editor called for are compiled to SVG with mmdc into `diagrams/` (beside their
`.mmd` sources) and embedded as `<img>`, each preceded by an HTML comment pointing to its `.mmd` source
so a reading agent gets the diagram's meaning without parsing path data. Quantitative charts use **Chart.js** — a version-pinned
copy vendored into `assets/` (not a CDN link, so the Report stays offline and self-contained): a
`<canvas>` plus a compact, readable `data` config, with a `<noscript>` `<table>` of the same numbers so
the data survives without JS. It reconstructs visuals from the **Findings** by default, downloading a
source image into `assets/` only when the visual is irreplaceable — always captioned with its
**Source** id. Writes the artifact to disk and returns only the path plus a short manifest, so the
verbose HTML never enters the main context.
_Avoid_: renderer, formatter, post-processor

**Follow-up question**:
A ready-to-use candidate sub-question the assessor proposes after a run. At the human checkpoint the
user selects any of these and/or adds their own; the selection becomes the next run's brief.
_Avoid_: suggestion

## Relationships

- A **Research brief** drives one or more **Research rounds**
- A **Research round** runs many **Retrievers** in parallel, each yielding **Sources**
- A **Finding** cites one or more **Sources** by numeric id
- A **Report** = the **goal** + the **Sources** + an **answer** assembled from **Findings**
- Each round the **Conflict-scout** diffs **Findings** for contradictions and feeds the **Assessor**;
  on a deep brief the **Verifier** then tries to refute material **Findings** and also feeds the gate
- Every **Finding** carries a typed **evidence span** (a verbatim `quote` where the source allows), so
  its citations are auditable
- The **Assessor** green-lights coverage; only then the **Synthesizer** reconciles the **Findings**
  and composes the draft **answer**, which the **Editor** trims and the **Composer** renders

## Example dialogue

> **Dev:** "The same article came back from two retrievers — is that two sources or one?"
> **Domain expert:** "One **Source** — dedup by URL, one numeric id. Both retrievers surfacing it
> doesn't double-count; it just raises confidence in the **Findings** that cite it."

## Flagged ambiguities

- **"source" vs "citation"**: a **Source** is the resource (carrying a numeric id); a *citation* is a
  reference to that id inside the answer. Kept distinct.
- **"round" vs "loop"**: a **Research round** is one pass; the *loop* is the control structure that
  decides whether to run another round.
- **Assessor vs Synthesizer vs Editor**: three sequential single-responsibility stages on different
  objects. The **Assessor** judges *coverage* (run another round?) and gates the loop; the
  **Synthesizer** *composes* the cited draft and reconciles contradictions; the **Editor** judges
  *prose* (concise and readable?). Gate → compose → polish.
- **Where audience lives**: only in the **Editor**. The **Synthesizer** composes *audience-neutral*
  (the full, faithful argument); the **Editor** is the sole stage that adapts it to the brief's tier
  (`lay`/`informed`/`practitioner`/`expert`) — so the same synthesis can be re-edited for a different reader without
  re-synthesis. The **Composer** is audience-neutral too: it only renders what the Editor marked.
- **"cross-check" is split**: the **Conflict-scout** *detects* contradictions among findings (per
  round); the **Assessor** *decides* which warrant another round; the **Synthesizer** *surfaces* what
  survives. No single stage "does cross-check" end-to-end.
- **Conflict-scout vs Verifier**: the scout checks findings against *each other* (internal
  consistency, every round); the **Verifier** checks a finding against independent *ground truth*
  (only on deep briefs). Different objects, different trigger. Fidelity (does the cited source say
  it?) is handled by neither — it is enforced structurally by the **Finding's** evidence span.
