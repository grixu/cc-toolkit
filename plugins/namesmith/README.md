# namesmith

Business name discovery for Claude Code. Describe your idea, get a curated list of name candidates — each challenged by a scoring sub-agent before domain availability is checked automatically.

## Skill

| Trigger | Description |
|---|---|
| "help me name my business" | Start a guided naming session |
| "business name ideas for..." | Generate and evaluate names with domain check |
| "what should I call my startup" | Full 4-phase workflow |
| `/namesmith [description]` | Direct invocation with business description |

## Workflow

```
namesmith [business description]
  → Phase 0: Gather business context (if needed)
  → Phase 1: Generate 15–20 name candidates across 6 archetypes
  → Phase 2: name-challenger sub-agent scores and filters (threshold 6/10)
  → Phase 3: Domain availability check via Instant Domain Search MCP
  → Phase 4: Present curated table + explore/regenerate options
```

## Domain Availability

The plugin bundles [Instant Domain Search MCP](https://instantdomainsearch.com/mcp) — no API key or manual setup required. It is activated automatically when the plugin is installed.

If the service is unavailable, the skill degrades gracefully: names are presented without domain data, with a link for manual verification.

## Challenger Sub-Agent

The `name-challenger` agent scores each name on 5 dimensions (2 points each, 10 total):

1. **Memorability** — syllable count, novel sound cluster
2. **Spelling-pronunciation alignment** — no homophones with negative words
3. **Brand distinctiveness** — low trademark collision risk
4. **Domain hackability** — root length ≤10 chars favored
5. **Business context fit** — evokes category, customer, or value prop

Names scoring ≥ 6/10 advance to domain checking. If fewer than 5 survive, the top 5 by score are used regardless of threshold.
