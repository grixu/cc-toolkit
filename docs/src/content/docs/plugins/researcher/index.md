---
title: researcher
description: Answers a research question with an HTML report in which every claim cites a numbered web source.
---

researcher answers a research question with a self-contained HTML report in which every claim cites a numbered web source.
It searches several angles in parallel, checks the findings for gaps and contradictions, and lets you extend the same report with follow-up questions.

## Install

```
/plugin install researcher@cc-toolkit
```

It also needs:

- [Dynamic workflows](https://code.claude.com/docs/en/workflows). On Pro, turn them on in the Dynamic workflows row of `/config`.
- The [firecrawl](https://www.firecrawl.dev) MCP server. When firecrawl fails, the research agents fall back to WebSearch.
- Optional: the Mermaid CLI (`mmdc`) for diagrams. Without it, the report shows that data as tables or charts.

## What it does

| Command or skill | What it does |
|---|---|
| `/researcher:research "<question>"` | Asks about any brief settings it can't infer, then launches a background workflow that researches the question and writes the report to `research/<slug>/output.html`. |

The skill runs only when you type the command. A plain "research X" request doesn't start it.

## Usage

```
/researcher:research "How does HTTP/3 differ from HTTP/2 in practice?"
```

- Run the command with your question. The skill prints the report title, sections, and source count, then offers to open the report.
- After a run, pick one of up to four suggested follow-up questions, or write your own. The skill rewrites the same report and moves the previous version to `snapshots/`.
- In a new session, run the command with a related question. When a report on the same topic exists, the skill asks whether to extend it or start fresh.

A run takes several minutes and uses many tokens, which stay inside the workflow, not in your session.

## Options

| Setting | Options | Effect |
|---|---|---|
| Depth | Quick, Standard (default), Deep | Up to 1, 2, or 3 research rounds. Deep adds a pass that tries to refute findings. |
| Recency | Recent (about 2 years), Any (default), Latest | Which sources it favors. |
| Sources | Broad (default), Authoritative, Technical-academic | Which source types it accepts. |
| Audience | Lay, Informed (default), Practitioner, Expert | How the report is written. |

The report uses the language of your question. To override it, say so in the question.

The research agents follow your permission rules, and a permission prompt pauses the run until you answer it.
The [plugin README](https://github.com/grixu/cc-toolkit/blob/main/plugins/researcher/README.md) lists the tools to allow before you start, and every other option.
