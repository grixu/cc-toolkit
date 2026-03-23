# session-learner

A Claude Code plugin that mines your conversation for friction signals and converts them into durable, team-shared documentation updates.

## What it does

At the end of a development session, this plugin analyzes the conversation for moments where:
- You **corrected** Claude's approach
- You **repeated** the same instruction multiple times
- Claude **deviated** from established patterns and you approved it
- A **new pattern** emerged that isn't documented yet

Each finding is presented with evidence (direct conversation quotes) for you to Accept, Modify, or Skip before any changes are made.

## How it works

1. **Analyze** — Scans conversation for friction signals and classifies each finding
2. **Verify** — Reads target files and auto memory to confirm findings are genuinely missing
3. **Review** — Presents each finding interactively, one at a time, with evidence
4. **Apply** — Writes accepted changes to `.claude/rules/` files or `CLAUDE.md`
5. **Coordinate** — Reconciles with auto memory, summarizes what went where

## Why not just use auto memory?

Auto memory is personal, automatic, and machine-local. This plugin produces **team-shared, reviewed, version-controlled** documentation that benefits everyone working on the project. It also deduplicates against auto memory to avoid capturing the same learning twice.

## Installation

```
/plugin marketplace add grixu/cc-toolkit
/plugin install session-learner@cc-toolkit
```

## Usage

At the end of a session (or whenever you want to capture learnings):

```
/learn
```

Also triggers on phrases like "what did we learn", "update rules", "session review", or "upgrade knowledge".

## Output targets

| Target | When | Shared? |
|--------|------|---------|
| `.claude/rules/<topic>.md` | Coding standards, conventions, architectural decisions | Yes (version-controlled) |
| `CLAUDE.md` | High-level project instructions | Yes (version-controlled) |
| Hookify rules | Regex-findable repeated errors (if hookify plugin installed) | Yes (version-controlled) |
| Auto memory | Personal preferences, ephemeral learnings | No (machine-local) |
