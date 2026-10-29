---
name: quality-review
description: >-
  Code quality and craft review of a change: readability, structure, naming, object/state
  design and needless complexity, not correctness, security, performance or test coverage. Use
  when the user says "quality review", "review jakości", "sprawdź jakość kodu", "przejrzyj pod
  kątem jakości", "czy ten kod się dobrze czyta", or asks whether a change reads cleanly and is
  well structured. Apt for model-generated code that works but is glued together: deep nesting
  instead of guard clauses, magic literals, names after mechanism not intent, queries that
  mutate, leaked mutable collections, near-identical functions, misplaced logic, pass-through
  wrappers, and the repo's own coding standards. Reviews the current branch diff by default
  (auto-detects the base, or pass --base), or explicit file/dir paths. Returns findings tagged
  family · rule · severity with a concrete fix, then offers to apply the safe ones.
---

# quality-review

This file is the Codex entry point. The skill itself is the Claude Code body, which you follow
under the host mapping.

1. Find the plugin root, the directory that contains `.codex-plugin/`. This file is
   `<root>/codex/skills/quality-review/SKILL.md`, so the root is three directories above it. Use
   its absolute path everywhere below.
2. Read `<root>/codex/host.md` completely, in a command of its own. Shell output past about 10k
   tokens loses its middle, so never join two files in one read.
3. Read `<root>/skills/quality-review/SKILL.md` completely and follow it under that mapping. Its
   arguments are the text written after this skill's mention, or the paths and `--base` the
   user's request names when the skill was picked without a mention.
