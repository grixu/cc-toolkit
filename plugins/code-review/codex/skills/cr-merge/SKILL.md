---
name: cr-merge
description: >-
  Headless last step of a code review that another workflow drives — merges the lens outputs
  cr-scan wrote into one re-graded report, writes it into the context directory, and returns every
  finding with its fix and risk class in a fixed line shape. Asks nothing and applies nothing. Not
  for interactive use: a person reviews with $code-review:start-cr.
---

# cr-merge

This file is the Codex entry point. The skill itself is the Claude Code body, which you follow
under the host mapping.

1. Find the plugin root, the directory that contains `.codex-plugin/`. This file is
   `<root>/codex/skills/cr-merge/SKILL.md`, so the root is three directories above it. Use its
   absolute path everywhere below.
2. Read `<root>/codex/host.md` completely, in a command of its own. Shell output past about 10k
   tokens loses its middle, so never join two files in one read.
3. Read `<root>/skills/cr-merge/SKILL.md` completely and follow it under that mapping. Its
   `$ARGUMENTS` is the text written after this skill's mention.

The closing block that body defines is this skill's output, in exactly its fixed shape.
