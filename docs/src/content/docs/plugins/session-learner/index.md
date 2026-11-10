---
title: session-learner
description: Finds where you corrected or repeated yourself in a session and proposes updates to CLAUDE.md or .claude/rules/ that you approve.
---

Corrections you give Claude are lost when the session ends, so the next session repeats the same mistakes.
session-learner finds those moments and proposes a documentation change for each, with the quote that prompted it.
It writes only the changes you accept.

## Install

```
/plugin install session-learner@cc-toolkit
```

Optional: install [hookify](/plugins/hookify/) too. With it, a mistake that a regular expression can catch can become a hook instead of a prose rule.

## What it does

| Command or skill | What it does |
|---|---|
| `/session-learner:learn` | Reads the conversation still in context and finds corrections, repeated instructions, and outdated documentation. It shows one finding at a time and applies the ones you accept. Also starts when you say "what did we learn," "update rules," "session review," or "capture learnings." |

For each finding, you choose Accept, Modify, Skip, or Auto-memory.
Auto-memory writes nothing and leaves the finding to Claude Code's built-in memory.

Changes go to one of these targets:

| Target | Used for |
|---|---|
| `.claude/rules/<topic>.md` | Conventions, pitfalls, and architectural decisions |
| `CLAUDE.md` | High-level project instructions |
| Hookify rule (`.claude/hookify.*.md`) | Repeated errors a regular expression can catch without false positives |

## Usage

- Run `/session-learner:learn` at the end of a session, before `/compact` or `/clear`. It reads only the conversation still in context.
- Say "what did we learn" at the end of a session. The skill starts on its own.

The [plugin README](https://github.com/grixu/cc-toolkit/blob/main/plugins/session-learner/README.md) has every option.
