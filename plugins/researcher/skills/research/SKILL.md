---
name: research
description: "Produce a source-grounded, cited HTML research report on a question. Gathers a brief (depth, recency, source mix, audience) then launches a bundled Dynamic Workflow that fans out firecrawl retrieval into findings, gates rounds on coverage + contradictions, synthesizes a cited answer, and renders an evolving HTML report. Use for substantive research requests: 'research X', 'zbadaj/zresearchuj X', 'do a deep dive on', 'find out everything about', 'write me a report on', 'compare A vs B with sources', 'what does the evidence say about'. Invoke explicitly as /researcher:research \"<question>\". Requires Dynamic Workflows enabled + the firecrawl MCP."
argument-hint: "<research question>"
disable-model-invocation: true
allowed-tools: Workflow AskUserQuestion Read Bash(echo:*) Bash(ls:*) Bash(test:*) Bash(cat:*) Bash(find:*) Bash(open:*) Bash(xdg-open:*)
---

# research — source-grounded research report

Front-end orchestrator for the `researcher` workflow. Gather a brief, resolve where the report lives, launch the
bundled Dynamic Workflow, present the result, then run the follow-up checkpoint that extends the **evolving** report.

The workflow does all the heavy lifting (retrieval, the gated round loop, synthesis, editing, HTML rendering) and
returns only a compact manifest + path — the verbose HTML never enters this conversation.

## Context

- Plugin root: !`echo "$CLAUDE_PLUGIN_ROOT"`
- Default output base: `./research` (one folder per report: `./research/<slug>/`)

## 0. Prerequisites (check once, fail clearly)

This skill needs **Dynamic Workflows** enabled (Claude Code v2.1.154+, paid plan; on Pro they must be enabled
per-session) and the **firecrawl MCP** installed with `mcp__firecrawl__firecrawl_search` / `firecrawl_scrape`
allow-listed. If the `Workflow` tool is unavailable, tell the user to enable Dynamic Workflows and stop — do not
attempt an inline `Agent` fan-out (that defeats the whole design; see the plugin README).

## 1. Get the question

- Take the question from `$ARGUMENTS`. If empty, ask the user what they want researched, then continue.

## 2. Resolve the brief (infer first, ask once)

Infer every dimension from the question and context; **only ask about what you genuinely cannot infer**, in a
**single** consolidated `AskUserQuestion` call (the tool allows ≤4 sub-questions). Often you will ask 1 question or
none. Never spend a sub-question on language — it is deterministically detectable (see below).

Dimensions and their option sets (list the inferred/sensible default **first**, label it `(Recommended)`):

| Dimension | Options (recommended first varies by inference) | Effect |
|---|---|---|
| **Depth** | Standard (balanced, 2 rounds) · Quick (1 round) · Deep (3 rounds + Verifier) | sets `maxRounds`; Deep also runs the adversarial Verifier |
| **Recency** | Recent (~2 years) · Any (incl. foundational) · Latest (fast-moving, newest first) | biases retriever date filters + query terms |
| **Sources** | Broad (all types, trust-weighted) · Authoritative (primary + reputable only) · Technical-academic (docs/standards/papers) | biases sub-query planning + inclusion |
| **Audience** | Informed · Lay · Practitioner · Expert | calibrates the Editor only |

**Audience tiers** (`lay` / `informed` / `practitioner` / `expert`): `lay` = general public; `informed` = generally
literate, not a specialist; `practitioner` = in the field but junior (knows the basics, not advanced terms or
abbreviations); `expert` = fluent in the jargon. Infer from the question's framing and any context (e.g. a project
CLAUDE.md). You may also pass a one-line free-form `descriptor` (e.g. "a PM evaluating vendors") to sharpen it.

**Language** (decision: never ask): default = **the language of the question**. Detect it from the question text.
An explicit in-question directive overrides it (e.g. "…napisz raport po angielsku" / "…in English" → English even
if the question is Polish). Pass a clear language name (e.g. `Polish`, `English`).

Smart defaults when you choose not to ask: depth `standard`, recency `any` (or `recent`/`latest` if the topic is
clearly time-sensitive), sources `broad`, audience `informed`.

## 3. Resolve the report folder (no index file — the per-report `state.json` files are the registry)

Reports live under `<base>/<slug>/`. There is **no global index** — discover existing reports by scanning the base
directory; each `state.json` is self-describing (`goal`, `brief`).

1. **Within this session** — if you just finished a run and the user is following up, **reuse the folder path you
   already hold** (set `extending: true`, same `slug`). No scan, no prompt.
2. **Fresh / new session** — derive `slug` = a slugified `goal` (lowercase, words joined by `-`). Then:
   - `test -f <base>/<slug>/state.json`? If it exists, read its `goal`:
     - **same topic** → tell the user a report already exists and offer **Extend** (continue it) vs **Fresh** (new report). Extend → `extending: true`. Fresh on a same-slug-different-angle → pick the next free `<slug>-2`, `<slug>-3`, …
     - **different goal** sharing the slug (collision) → use `<slug>-2` (etc.) for the new report.
   - To extend a **different** existing report, scan `<base>/*/state.json`, list their goals, and let the user pick which to continue.
3. New report → `extending: false`.

(`mkdir` for the folder is handled by the workflow's Setup step — you only resolve the path + the extend flag.)

## 4. Launch the workflow

Resolve the plugin root from the Context block above (call it `PLUGIN_ROOT`). Call the **Workflow** tool with the
bundled script by path and the brief as a real JSON object (not a stringified one):

```
Workflow({
  scriptPath: "<PLUGIN_ROOT>/workflows/research.js",
  args: {
    goal: "<the question>",
    depth: "quick|standard|deep",
    recency: "recent|any|latest",
    sources: "broad|authoritative|technical-academic",
    audience: { tier: "lay|informed|practitioner|expert", descriptor: "<optional one-liner>" },
    language: "<detected language name>",
    outputBase: "./research",
    slug: "<resolved slug>",
    extending: <true|false>,
    pluginRoot: "<PLUGIN_ROOT>"
  }
})
```

`pluginRoot` must be the resolved absolute path (the Composer copies `report.css` + `chart.umd.js` from
`<pluginRoot>/assets`). If the tool rejects `scriptPath`, fall back to `Read`-ing the file and passing its contents
as `script:` with the same `args`.

The workflow may return an `error` field instead of a report (`no-goal`, `schema-mismatch`, `no-findings`,
`synthesis-failed`, `compose-failed`). Relay its `message` plainly and stop — do not retry blindly.

## 5. Present the result

On success the workflow returns `{ artifactPath, manifest: { title, sections[], sourceCount, roundCount }, gaps[], followups[], warnings[] }`.

- Print the manifest **inline**: the title, the section list, and the source/round counts.
- Print the `artifactPath`.
- Surface any `warnings` (e.g. an image that failed to fetch, diagrams skipped because `mmdc` was unavailable).
- **Offer** to open it — do not auto-open: suggest `open "<artifactPath>"` on macOS (`xdg-open` on Linux).

## 6. Follow-up checkpoint (extend the evolving report)

If `followups[]` is non-empty, run a blocking `AskUserQuestion` (`multiSelect: true`) listing the proposed follow-up
questions as individually selectable options, and let the user add their own (the auto-added "Other"). Then:

- If the user selects/adds questions → build the next brief (their selection becomes the new `goal`; **inherit the
  same `slug`, `extending: true`, and the prior `brief` defaults** so the report stays one coherent, single-language
  document) and relaunch the workflow (step 4). The report is re-synthesized holistically and snapshotted before the
  overwrite — this is the same evolving `output.html`, not a new file.
- If the user is done → stop.

Mirror the calm, decision-handing-back style of the other orchestrator skills: surface and offer, don't unilaterally
declare the research "complete".
