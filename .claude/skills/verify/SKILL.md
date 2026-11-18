---
name: verify
description: Validate plugin structure, marketplace.json consistency, and changelog format across all plugins
---

Run the mechanical checks first, then judge only what they cannot. CI (`lint.yml`) runs the
same checks on every pull request.

## 1. Run the checks

```bash
node scripts/verify-plugins.mjs
claude plugin validate .claude-plugin/marketplace.json --strict
for d in plugins/*/; do claude plugin validate "$d"; done
for d in plugins/*/; do [ -d "$d/tests" ] && [ -f "$d/hooks/hooks.json" ] && claude plugin test "$d"; done
```

Plugins are validated without `--strict`: it fails on the mods' TypeScript warnings, many of
them TS5097 on the `.ts` import paths the mod loader requires. Read the warnings only when
you change a mod.

`verify-plugins.mjs` checks the required files, the `plugin.json` keys, semver, the
`.codex-plugin` copy, the marketplace entry and its description (identical to
`plugin.json`, at most two sentences), `## [Unreleased]`, author spelling, stray
`CLAUDE.md` files inside a plugin tree, and that the hand-copied decision-model files in
code-review, dev-kit and pr-proof are identical. `claude plugin validate` takes a required
path, so it iterates.

## 2. Do not re-check versions

`version` parity between `plugin.json` and `marketplace.json` is written by
`scripts/release.sh` on every release and has never drifted. The script checks only that a
version is semver.

## 3. Judge what the checks cannot

For each failure, say what needs to change. Two need a human call:

- **Author drift.** The script reports every distinct spelling and who carries it. Pick
  the canonical one (whatever the majority of plugins already use) and rewrite the
  outliers in both `plugin.json` and the marketplace entry. Also fix the template in
  `.claude/skills/new-plugin/SKILL.md` if it still emits the wrong spelling.
- **Changelog shape.** Beyond the required `## [Unreleased]` section, skim for Keep a
  Changelog format and semver-shaped version headings.

## 4. Summary

Print pass/fail per check. When everything passes, say so in one line. Otherwise list
exactly what needs to be fixed, most blocking first.
