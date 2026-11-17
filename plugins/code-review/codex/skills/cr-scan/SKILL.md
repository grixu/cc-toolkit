---
name: cr-scan
description: >-
  Headless code-review Scanner for one lens, or a listed few in turn — reads the context
  directory cr-prepare or $code-review:start-cr wrote, judges the change against each lens's
  rules, and writes each lens's findings into the directory for cr-merge. Asks nothing and edits
  nothing. Not for interactive use: a person reviews with $code-review:start-cr.
---

# cr-scan

This file is the Codex entry point. The skill itself is the Claude Code body, which you follow
under the host mapping.

1. Find the plugin root, the directory that contains `.codex-plugin/`. This file is
   `<root>/codex/skills/cr-scan/SKILL.md`, so the root is three directories above it. Use its
   absolute path everywhere below.
2. Read `<root>/codex/host.md` completely, in a command of its own. Shell output past about 10k
   tokens loses its middle, so never join two files in one read.
3. Read `<root>/skills/cr-scan/SKILL.md` completely and follow it under that mapping. Its
   `$ARGUMENTS` is the text written after this skill's mention or, when a parent agent sent you
   here, the arguments its message names.

The closing blocks that body defines are this skill's output, in exactly their fixed shape. As a
spawned child, they are your final message.
