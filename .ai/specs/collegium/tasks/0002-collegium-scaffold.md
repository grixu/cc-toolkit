---
name: Scaffold the collegium plugin
status: merged
spec: ../SPEC.md
elements: [CONFIG-1, DOCS-1]
decisions: [D25, D26]
repository: /Users/mateusz/grixu/cc-toolkit-collegium
branch: feat/collegium
branch-base: main
merge-after: []
worktree: /Users/mateusz/grixu/cc-toolkit-collegium.worktrees/task-collegium-scaffold
phase: 2
depends-on: []
tickets: []
---

## Goal

`plugins/collegium/` exists as a valid, registered plugin: its manifest carries the single Codex
`userConfig` toggle, `hooks/hooks.json` points at the mod module, and a CHANGELOG, a README
skeleton and the marketplace entry are in place.

## Done when

- CONFIG-1 row (section 8): `claude plugin validate plugins/collegium/ --strict` is valid —
  this task's row. The row's `/plugin configure collegium` toggle check is **environment-level**:
  it needs the plugin installed, and `release-collegium` exercises it.
- DOCS-1 row: `/verify` clean — branch-level, it passes once `collegium-readme` lands.

## Where to look

- CONFIG-1 — section 4, "CONFIG-1: collegium `userConfig`".
- DOCS-1 — section 4, "DOCS-1: collegium documentation and registration" (scaffold part only).
- Target layout — section 4, "Target architecture" tree.
- Work item C2 — section 6.

## Note

Follow `.claude/skills/new-plugin/SKILL.md` for the scaffold (version `0.0.0`) and read the
current Claude Code plugin documentation before creating the plugin or editing
`.claude-plugin/marketplace.json`, as the repository's `CLAUDE.md` requires. Never set or bump a
version by hand afterwards; `release.sh` owns it.
