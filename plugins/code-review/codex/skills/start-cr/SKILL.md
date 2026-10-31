---
name: start-cr
description: >-
  Manual multi-lens code review: runs every active review lens (comments, four craft lenses,
  correctness, security, coherence, assumptions, performance, spec) as parallel subagents over
  a change, merges them into one per-file report, and offers one apply menu. Reviews the current
  branch diff by default, or explicit paths, `--base <branch>`, `--spec <path>`, or a GitHub pull
  request with `--pr <number>`; on someone else's pull request it drafts review comments instead
  of editing. Edits nothing during the review.
---

# start-cr

This file is the Codex entry point. The command itself is the Claude Code body, which you follow
as its Orchestrator under the host mapping.

1. Find the plugin root, the directory that contains `.codex-plugin/`. This file is
   `<root>/codex/skills/start-cr/SKILL.md`, so the root is three directories above it. Use its
   absolute path everywhere below.
2. Read `<root>/codex/host.md` completely, in a command of its own.
3. Read `<root>/commands/start-cr.md` in 250-line ranges, one command each, until its last line:
   `nl -ba <file> | sed -n '1,250p'`, then `'251,500p'`, and on. The file is about 45 KB with line
   numbers, and a read that size loses its middle, which holds Step 3's dispatch and collect
   rules.
4. Follow that body under the mapping. Its `$ARGUMENTS` is the text written after this skill's
   mention, verbatim: paths, `--base <branch>`, `--spec <path>`, `--pr <number>`.

The notes below cover what the body needs from Codex beyond `host.md`.

## Step 3: one child per active lens

Send each lens this brief and nothing more, with absolute paths. The child reads conventions,
scope and its rules from the context directory, so anything you add is a paraphrase the body
forbids:

```
Read `<root>/codex/skills/cr-scan/SKILL.md` and follow it with arguments `--lens <lens> --context <context dir>`.
Return its closing block verbatim, and nothing else.
```

Spawn each child without parent history, as `host.md` says. A fresh child starts from that brief
alone; a forked one would carry this whole conversation into every lens.

Run the pool in this order:

1. Spawn lenses in `scope.json`'s order, back to back, until the pool `host.md` sizes is full.
2. Do the body's pre-reading: the diff, the changed files and the file-growth check.
3. Call `wait_agent` with `timeout_ms: 600000`. For each child that finished, keep its final
   message as that lens's `<result>`, free its slot, and spawn the next lens still waiting.
4. Repeat step 3 until every active lens has delivered or failed closed by the body's rules.
   Then go to Step 4.

The `spawn_agent` tool's advice to call `wait_agent` sparingly does not apply here: Step 4 needs
every lens. Never end the turn while a child runs. In Codex nothing wakes an ended turn, and
`codex exec` exits with the children's findings lost.

## Step 6: the apply menu

The menu is multi-select, so ask it in chat, with the commit mode in the same message:

- Write the report file first, as the body says, and name its path in the message.
- Question 1 holds the risk buckets you offer, numbered. The user may reply with several
  numbers.
- Question 2 holds the commit modes, with "Commit each family as it lands" marked recommended.
- End the turn on that message.

When nobody can answer, the menu has no default. Stop on it, and apply and commit nothing.

On the reply, read the report file back before anything else. Then add the selection under it
with `apply_patch` and continue with the apply phase.

## Step 6: editor children

When the body fans the safe batch out, give each group's editor this brief:

1. "Read `<root>/codex/host.md` and apply its mapping."
2. Its files and the exact approved fix for every site in them.
3. The Step 2 conventions note.
4. The body's invariants: locate each site by content, scrub every replacement, apply nothing
   beyond the listed fixes, run no build or tests, and return what was applied and what was
   skipped per file, with the reason.

Children edit the same checkout as you, so the body's disjoint-by-file ownership is what keeps
them from racing. Run the editors through the same pool and wait loop as the Scanners, and
commit their family yourself once every editor has delivered.
