---
name: pr-proof README, changelog, descriptions, keywords and tags
status: merged
spec: ../SPEC.md
elements: [DOCS-2]
decisions: [D53]
repository: /Users/mateusz/grixu/cc-toolkit
branch: feat/prepare-proof
branch-base: main
merge-after: []
worktree: /Users/mateusz/grixu/cc-toolkit.worktrees/task-pr-proof-docs
phase: 3
depends-on: [pr-proof-user-config, proof-signals-tool, prepare-proof-skill]
tickets: []
---

## Goal

pr-proof's README and the `[Unreleased]` section of its CHANGELOG describe the three new skills, the `proof_signals` tool and the new options. pr-proof's shared description, in `plugin.json` and in its marketplace entry, now covers every proof kind and the hand-off to pr-open, and both its keyword and tag lists gain the new kinds.

## Done when

- DOCS-2 (D53) probe row: this task's.
- A filled `[Unreleased]` is checked by `release.sh` itself: `release-pr-proof` exercises it.

## Where to look

- DOCS-2.
- What the docs describe: API-1, CONFIG-1, INTEGRATION-2, INTEGRATION-3, INTEGRATION-4, INTEGRATION-5.
- D53.

## Note

- The edge onto `pr-proof-user-config` exists because both tasks edit `plugins/pr-proof/.claude-plugin/plugin.json`, and the README documents the options it adds.
- The edges onto `proof-signals-tool` and `prepare-proof-skill` exist because the docs describe the tool and the skills those tasks build. `prepare-proof-skill` brings in the other executors through its own edges.
- Before editing `.claude-plugin/marketplace.json`, read the current Claude Code plugin documentation, as the repository's `CLAUDE.md` requires.
- Write under `[Unreleased]` only, and change no `version` in either file.
