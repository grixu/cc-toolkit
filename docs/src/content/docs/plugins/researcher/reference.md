---
title: Reference
description: The command, brief settings, requirements, permissions, report files, and error codes of researcher.
group: reference
sidebar:
  order: 3
---

## Command

```
/researcher:research "<research question>"
```

The skill runs only when you type the command; the model never starts it on its own.
Without a question, it asks what you want researched.

## Brief settings

The skill infers each setting from your question and context.
It asks one combined question about only the settings it can't infer.

| Setting | Options | Effect |
|---|---|---|
| Depth | Quick, Standard (default), Deep | Up to 1, 2, or 3 research rounds. The first round runs 3, 5, or 6 parallel searches. Deep adds a Verifier that tries to refute findings. |
| Recency | Recent (about 2 years), Any (default), Latest | Which sources the searches favor. Any includes foundational material. |
| Sources | Broad (default), Authoritative, Technical-academic | Which source types count. Authoritative skips forums and blogs; Technical-academic keeps to docs, standards, and papers. |
| Audience | Lay, Informed (default), Practitioner, Expert | How the Editor writes the report: jargon, density, and how many visuals. Nothing else changes. |

Table 1. Brief settings and their defaults.

A later round runs only when the previous one left gaps.
For a time-sensitive topic, the skill may pick Recent or Latest instead of Any.

**Language** is never asked.
The report uses the language of your question, unless the question says otherwise ("…in English," "…po polsku").

## Requirements

- **Dynamic workflows.** Claude Code offers them on all paid plans, with Anthropic API access, and on Amazon Bedrock, Google Cloud's Agent Platform, and Microsoft Foundry. On Pro, turn them on once in the Dynamic workflows row of `/config`.
- **The firecrawl MCP server.** When firecrawl fails or can't read a site, the agents fall back to WebSearch.
- **Optional: the Mermaid CLI** for diagrams: `pnpm add -g @mermaid-js/mermaid-cli`. The skill checks for a global `mmdc` and never installs it. Without it, the report shows that data as tables or charts.

Charts (Chart.js 4.5.0) and the stylesheet ship with the plugin.

## Permissions

The research runs as a background workflow of many agents.
They follow your permission rules, and an agent that hits a permission prompt pauses the run until you answer it.
Allow the search tools before you start:

```json
{
  "permissions": {
    "allow": [
      "mcp__firecrawl__firecrawl_search",
      "mcp__firecrawl__firecrawl_scrape",
      "WebSearch"
    ]
  }
}
```

These rules assume your firecrawl server is named `firecrawl`.
If yours has another name, change the `mcp__firecrawl__` prefix.

The agents also run shell commands (`mkdir`, `rm`, `cp`, `sed`, `date`, `curl` for source images, and `mmdc`) and write files under `./research/`.
If your permission mode asks before these, allow them too.
Claude Code also asks you to approve the workflow launch itself; how often depends on your permission mode.

## Report folder

Each report lives in its own folder under your current directory.
The folder name is the question, lowercased, with words joined by `-`.
When a different question produces the same name, the new report goes to `<slug>-2`, then `<slug>-3`.

```
research/<slug>/
  output.html     the report; open this
  answer.md       the same answer as Markdown
  state.json      the brief and the source list; used to extend the report
  findings/       the extracted findings with their evidence, as JSON files
  assets/         report.css, Chart.js when the report has charts, downloaded source images
  diagrams/       Mermaid sources and compiled SVGs
  snapshots/      earlier versions, as output.<UTC timestamp>.html
```

`answer.md` is an export only.
A follow-up rebuilds the answer from `findings/`, never from the earlier text.

## Run summary

On success, the skill prints:

- the report title, its sections, and the source and round counts
- the path to `output.html`, with an offer to open it
- warnings, for example a source image that failed to download, a site that blocked scraping, or diagrams skipped because `mmdc` is missing
- up to four follow-up questions to pick from, when the run proposed any

## Error codes

When a run fails, the skill shows the error and its message, then stops without retrying.

| Error | Meaning | What to do |
|---|---|---|
| `no-findings` | No search returned usable results. | Check that firecrawl works and is allowed, then broaden the question. |
| `schema-mismatch` | An incompatible version of the plugin made the existing report. | Start a fresh report. |
| `persist-failed` | Saving the findings failed; the HTML report wasn't changed. | Run the command again. |
| `compose-failed` | The findings are saved, but the HTML wasn't rendered. | Run the command again to render it. |
| `synthesis-failed` | No answer was produced. | Run the command again. |
| `no-goal` | No question reached the workflow. | Run the command with a question. |

Table 2. Workflow error codes.

Some sites, such as reddit.com, can't be scraped.
The agents fall back to search snippets, and the skill lists skipped sources as warnings.
