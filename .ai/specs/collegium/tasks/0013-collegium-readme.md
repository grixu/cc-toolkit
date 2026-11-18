---
name: Collegium README, root README rows and description
status: todo
spec: ../SPEC.md
elements: [DOCS-1]
decisions: [D51, D26, D68, D75]
repository: /Users/mateusz/grixu/cc-toolkit-collegium
branch: feat/collegium
branch-base: main
merge-after: []
worktree:
phase: 2
depends-on: [collegium-scaffold, run-and-config-ui]
tickets: []
---

## Goal

The collegium README documents requirements, enabling, the config file, the tools contract and the
data-leaves-the-machine note; the root README's plugin and requirements tables list collegium; and
the plugin description, identical in `plugin.json` and `marketplace.json`, has passed the
description passes.

## Done when

- DOCS-1–3 row (section 8), collegium part: `/verify` clean and the D51 description passes run —
  this task's row.

## Where to look

- DOCS-1 — section 4, "DOCS-1: collegium documentation and registration".
- Risk K2 — section 3, "Risks accepted".
- D51 — section 3; the repository `CLAUDE.md`, "Plugin descriptions".
- Work item C14 — section 6.

## Note

Fills in the README skeleton, `plugin.json` description and marketplace entry `collegium-scaffold`
created; describes the skill and command `run-and-config-ui` ships and the tools behind them. Run
`/compound-writing:cw-scribe`, `/compound-writing:cw-reader` and `/compound-writing:cw-ai-check`
on the description until reader and ai-check raise nothing that matters. Never touch the version
field. The README's Requirements section and the root README's requirements row already state
Claude Code 2.1.327 and the Codex CLI (commit `d25540bb`, D68): keep them and add the plugin-table
row. Document `/collegium:run --wait` (D75).
