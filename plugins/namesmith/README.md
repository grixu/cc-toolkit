# namesmith

Find a name for a business, product or app that is memorable, distinctive and still has a domain
you can register. Describe what you are building, and namesmith generates candidates, drops the
weak ones, and checks which domains are free.

## Requirements

- Network access to the Instant Domain Search MCP server at
  `https://mcp.instantdomainsearch.com/mcp`. The plugin registers it for you; it needs no API key
  or sign-up. If the server is unreachable, you still get names, each with a link to check its
  domains by hand.

## Installation

```
/plugin marketplace add grixu/cc-toolkit
/plugin install namesmith@cc-toolkit
```

If the install summary says a reload is needed, run `/reload-plugins` so the domain server
connects.

## Usage

Ask in plain words:

```
I'm building a project management SaaS for small agencies, help me name it
```

or invoke the skill with a description:

```
/namesmith:namesmith coffee subscription for remote workers, warm and playful tone
```

Phrases such as "help me name my business", "business name ideas for", "what should I call my
company", "name my app" or "find an available domain name for my business" also start it.

If your description does not say what the product does, who it is for and what tone you want,
namesmith first asks up to four short questions.

## What you get

A table of the names that passed review, usually 5 to 15:

```
| Name    | Type     | .com | .io | .app | Notes                       |
|---------|----------|------|-----|------|-----------------------------|
| Veltora | Coined   | ✓    | ✓   | ✓    |                             |
| NestRun | Compound | ✗    | ✓   | ✓    | .com taken; nestrun.io free |
```

Each list includes one plain, descriptive "safe anchor" name. When a name's `.com` is taken,
namesmith also suggests `.com` variations built from common prefixes and suffixes. Then you
choose one of:

- Explore one name: `.com` variations for that name and its availability across other
  extensions.
- Run another round: new candidates, steered away from the reasons the last batch failed. After
  three rounds, namesmith asks you to revisit your description instead.
- Done.

Scores stay hidden unless you ask why a name was dropped.

## How names are filtered

1. namesmith generates 15 to 20 candidates across six styles: coined words, compound words,
   metaphorical names, descriptive names, short coined names (6 characters or fewer), and names
   suited to domain hacks. It drops near-duplicates and names with unfortunate meanings in other
   languages.
2. A reviewer agent, `name-challenger`, scores each name from 0 to 2 on five criteria:
   memorability, spelling that matches pronunciation, distinctiveness and trademark risk, domain
   hackability, and fit with your business. Names scoring 6 of 10 or more pass. If fewer than
   five pass, the top five by score are used and the table says the bar was relaxed. The skill
   runs this agent for you; you do not invoke it yourself.
3. namesmith checks `.com`, `.io`, `.co` and `.app` for each name that passed.

## When the domain check fails

If the domain server cannot be reached, namesmith says so once, does not retry, and shows each
name with a link for a manual check (`https://instantdomainsearch.com/?q=<name>`). If this
happens every time, add the server to your own MCP settings:

```
claude mcp add --transport http instant-domain-search https://mcp.instantdomainsearch.com/mcp
```
