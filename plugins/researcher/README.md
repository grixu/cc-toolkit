# researcher

researcher answers a research question with an HTML report in which every claim cites a numbered web source. It searches several angles in parallel, checks the findings for gaps and contradictions, and lets you extend the same report with follow-up questions.

## Install

researcher is a Claude Code plugin. Add the `cc-toolkit` marketplace once, then install the plugin:

```
/plugin marketplace add grixu/cc-toolkit
/plugin install researcher@cc-toolkit
```

## Requirements

- Dynamic workflows. Claude Code offers them on all paid plans, with Anthropic API access, and on Amazon Bedrock, Google Cloud's Agent Platform and Microsoft Foundry. On Pro, turn them on from the Dynamic workflows row in `/config`. Without the `Workflow` tool, the skill stops and tells you to enable it.
- The firecrawl MCP server. When firecrawl fails or cannot read a site, the research agents fall back to WebSearch.
- Optional: the Mermaid CLI for diagrams, `pnpm add -g @mermaid-js/mermaid-cli`. Without a global `mmdc`, the report shows that data as tables or charts instead.

Charts (Chart.js 4.5.0) and styling ship with the plugin, so reports work offline and load nothing from a CDN.

### Permissions

The research runs as a background workflow of many agents. Those agents follow your permission rules, and an agent that hits a permission prompt pauses the run until you answer it. Allow the search tools before you start:

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

These rules assume your firecrawl server is named `firecrawl`; change the `mcp__firecrawl__` prefix if yours has another name.

The agents also run shell commands (`mkdir`, `rm`, `cp`, `sed`, `date`, `curl` for source images, and `mmdc`) and write files under `./research/`. If your permission mode asks before these, allow them too. Claude Code also asks you to approve the workflow launch itself; how often depends on your permission mode.

## Usage

The skill runs only when you type the command. A plain "research X" request does not start it.

```
/researcher:research "How does HTTP/3 differ from HTTP/2 in practice?"
/researcher:research "Porównaj bazy wektorowe pod kątem produkcyjnym"
```

The skill infers the brief from your question and asks one combined question only about what it cannot infer:

| Setting | Options | Effect |
|---|---|---|
| Depth | Quick, Standard (default), Deep | Up to 1, 2 or 3 research rounds; the first round runs 3, 5 or 6 parallel searches. Deep adds a pass that tries to refute findings. |
| Recency | Recent (about 2 years), Any (default), Latest | Which sources it favors |
| Sources | Broad (default), Authoritative, Technical-academic | Which source types it accepts |
| Audience | Lay, Informed (default), Practitioner, Expert | How the report is written; nothing else |

A further round runs only when the previous one left gaps, and the run stops early when a round adds no findings.

The report is written in the language of your question. To override it, say so in the question ("...in English", "...po polsku").

A run takes several minutes and uses many tokens. Those tokens stay inside the workflow, not in your session. Quick costs the least; Deep is the most thorough.

## What you get

When the run finishes, the skill prints the report title, its sections, and the source and round counts. It then prints the path and offers to open the report.

The report lives in a folder under your current directory:

```
research/<slug>/
  output.html     the report; open this
  answer.md       the same answer as Markdown
  state.json      the brief and the source list; used to extend the report
  findings/       the extracted findings with verbatim quotes, as JSON files
  assets/         report.css, Chart.js when the report has charts, downloaded source images
  diagrams/       Mermaid sources and compiled SVGs
  snapshots/      earlier versions, as output.<UTC timestamp>.html
```

The report is one page:

- Inline `[n]` citations link to a numbered source list. Each source shows a trust tier (primary, secondary, community) and an access date.
- Unresolved contradictions and open questions get their own boxes.
- Charts, diagrams and tables appear only where they help.
- It supports light and dark mode and prints cleanly.

A citation means "the source says this", not "this is true". Each finding carries a verbatim quote from its source, and Deep adds an adversarial check on top.

## Continue a report

- Same session: after a run, the skill offers up to four follow-up questions. Pick any or write your own, and it researches them and rewrites the same report. The previous version moves to `snapshots/`, and existing citation numbers stay valid.
- New session: run the command with a related question. When a report on the same topic exists, the skill asks whether to extend it or start fresh. To extend a different report, ask for it, and the skill lists the reports under `./research/`.

## Troubleshooting

| Error | Meaning | What to do |
|---|---|---|
| `no-findings` | No search returned usable results | Check that firecrawl works and is allowed; broaden the question |
| `schema-mismatch` | An incompatible version of the plugin made the existing report | Start a fresh report |
| `persist-failed` | Saving the findings failed; the HTML report was not changed | Run the command again |
| `compose-failed` | The findings are saved but the HTML was not rendered | Run the command again |
| `synthesis-failed` | No answer was produced | Run the command again |
| `no-goal` | No question reached the workflow | Run the command with a question |

Some sites, such as reddit.com, cannot be scraped. The agents fall back to search snippets, and the skill lists skipped sources as warnings.

## How it works

The skill launches the bundled workflow `workflows/research.js`, which runs these steps:

1. Plan distinct search angles.
2. Run retrieval rounds: parallel searches extract findings with quotes, a contradiction check runs, and an assessor decides whether another round is needed.
3. Write one cited answer.
4. Edit it for the chosen audience.
5. Save the state, then render the HTML.

Contributors: `CONTEXT.md` defines the terms, and `docs/adr/` records the design decisions.
