---
title: namesmith
description: Suggests names for a business, product, or app, filters out weak candidates, and checks which domains are free.
---

namesmith helps you find a name for a business, product, or app that's memorable, distinctive, and still has a domain you can register.
You describe what you're building, and it generates candidates, drops the weak ones, and checks domain availability.

## Install

```
/plugin install namesmith@cc-toolkit
```

There's nothing else to install.
Domain checks use the Instant Domain Search MCP server, which the plugin registers for you without an API key.
If the install summary says a reload is needed, run `/reload-plugins` so the domain server connects.

## What it does

| Command or skill | What it does |
|---|---|
| `/namesmith:namesmith [description]` | Generates 15 to 20 candidates, filters them, and checks `.com`, `.io`, `.co`, and `.app` for each name that passes. Also starts when you ask for help naming a business, startup, app, or product. |
| `name-challenger` agent | Scores each candidate on memorability, spelling, distinctiveness and trademark risk, domain hackability, and business fit. The skill runs it for you. |

You get a table of the names that passed review, with domain availability and notes.
Then you can explore one name, run another round, or finish.

## Usage

- Ask "I'm building a project management SaaS for small agencies, help me name it." namesmith starts on its own.
- Run `/namesmith:namesmith coffee subscription for remote workers, warm and playful tone`. A description that covers the product, audience, and tone skips the follow-up questions.
- Pick "Explore one name" after the table appears. You get `.com` variations and availability across other extensions.

If the domain server is unreachable, you still get names, each with a link to check its domains by hand.

The [plugin README](https://github.com/grixu/cc-toolkit/blob/main/plugins/namesmith/README.md) has every option.
