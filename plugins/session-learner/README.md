# session-learner

Corrections you give Claude during a session are lost when the session ends, so the next session
repeats the same mistakes. session-learner turns them into project rules: it finds the moments
you corrected or repeated yourself, proposes a documentation change for each with the quote that
prompted it, and writes only the changes you accept.

## Requirements

- Nothing beyond Claude Code.
- Optional: the [hookify](../hookify/README.md) plugin. With it, a mistake that a regular
  expression can catch (for example, an import from a banned package) can become a hook that
  warns or blocks when the file is written, instead of a prose rule.

## Installation

```
/plugin marketplace add grixu/cc-toolkit
/plugin install session-learner@cc-toolkit
```

## Usage

Run it in the session you want to learn from, before `/compact` or `/clear`. It reads only the
conversation still in context.

```
/session-learner:learn
```

Phrases such as "what did we learn", "update rules", "session review" or "capture learnings"
also start it.

## What happens

1. Map the docs. It finds `.claude/rules/*.md`, `CLAUDE.md` files, `AGENTS.md` files, your
   project's auto memory (`MEMORY.md` under `~/.claude/projects/`), and hookify rules.
2. Find friction. It looks for corrections, repeated instructions, new patterns, outdated or
   wrong documentation, missing coverage and repeated errors. It drops anything already
   documented and anything personal rather than useful to the team.
3. Check each finding against the current content of its target file, so nothing already
   covered is proposed.
4. Review one finding at a time. Each shows the target file, the proposed lines in context, and
   a direct quote from the conversation as evidence:

   ```
   Finding 2/4: correction
   Target: .claude/rules/api.md  (Add)
     ...existing lines...
   + Return 404, not 403, when the resource belongs to another tenant.
     ...existing lines...
   Evidence: "no, other tenants' resources must look like they don't exist"
   Accept / Modify / Skip / Auto-memory?
   ```

   - Modify asks for your wording.
   - Auto-memory writes nothing. It marks the finding as personal and leaves it to Claude Code's
     built-in memory.
   - Hookify candidates, and learnings promoted from auto memory into a rules file, offer only
     Accept or Skip.
5. Apply the accepted changes as targeted edits.
6. Summarize what changed in which file, what was left to auto memory, and what was skipped.

With more than 10 findings, you first choose which files to review. With none, it tells you why.

## Where changes go

| Target | Used for | Shared with the team? |
|---|---|---|
| `.claude/rules/<topic>.md` | Conventions, pitfalls, architectural decisions. A new file gets `paths:` frontmatter when the rule applies to part of the codebase. | Yes, once committed |
| `CLAUDE.md` | High-level project instructions | Yes, once committed |
| Hookify rule (`.claude/hookify.*.md`) | Repeated errors a regular expression can catch without false positives | Only a `.rule.md` file; a `.local.md` file stays personal |

session-learner never writes to auto memory. When it promotes a learning from auto memory into a
rules file, the summary reminds you to delete the old entry with `/memory`.

Files are kept under about 200 lines. When a target would grow past that, it proposes a new topic
file instead.
