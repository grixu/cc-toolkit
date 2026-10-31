---
name: comment-review
description: >-
  Comment-quality review of a change, comments only, not logic, naming or structure. Use when the
  user says "comment review", "review komentarzy", "sprawdź komentarze", "przejrzyj komentarze",
  or asks whether the comments in a change are worth keeping. Reviews the current branch diff by
  default (auto-detects the base, or pass --base), or explicit file/dir paths. Judges every
  comment against a focused rule set (no code-narration, decisions only, not too long, no
  cross-file/doc/spec-id refs like F1 or §4.1, no banners, no change history, no
  process-narration, no commented-out code, nothing that contradicts the code, rationale where
  the behavior lives) and returns a per-comment verdict (KEEP / REMOVE / REWRITE / MOVE / ADD)
  with a concrete suggested fix.
---

# comment-review

This file is the Codex entry point. The skill itself is the Claude Code body, which you follow
under the host mapping.

1. Find the plugin root, the directory that contains `.codex-plugin/`. This file is
   `<root>/codex/skills/comment-review/SKILL.md`, so the root is three directories above it. Use
   its absolute path everywhere below.
2. Read `<root>/codex/host.md` completely, in a command of its own. Shell output past about 10k
   tokens loses its middle, so never join two files in one read.
3. Read `<root>/skills/comment-review/SKILL.md` completely and follow it under that mapping. Its
   arguments are the text written after this skill's mention, or the paths and `--base` the
   user's request names when the skill was picked without a mention.
