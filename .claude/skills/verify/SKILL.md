---
name: verify
description: Validate plugin structure, marketplace.json consistency, and changelog format across all plugins
---

Run the following checks for every plugin in `plugins/*/`:

## 1. Plugin structure
For each plugin directory, verify these files exist:
- `.claude-plugin/plugin.json`
- `CHANGELOG.md`
- `README.md`

Report any missing files.

## 2. plugin.json validity
For each plugin's `.claude-plugin/plugin.json`, verify:
- Has required fields: `name`, `version`, `description`, `author`, `repository`, `keywords`
- `version` matches semver format (e.g., `1.0.0`, `0.1.1`)
- `name` matches the plugin directory name

## 3. Marketplace consistency
Read `.claude-plugin/marketplace.json` and for each plugin entry:
- `name` matches the plugin's `plugin.json` name
- `version` matches the plugin's `plugin.json` version
- `source` path points to the correct directory (`./plugins/<name>`)
- `description` is present and non-empty

Report any plugins in `plugins/` that are missing from marketplace.json, and any marketplace entries pointing to non-existent plugins.

## 4. Changelog format
For each plugin's `CHANGELOG.md`:
- Must have an `## [Unreleased]` section (required by the release script)
- Must follow Keep a Changelog format
- Version entries should match semver

## 5. Plugin path variables
No file under `plugins/*/commands/` or `plugins/*/agents/` may reference the CLAUDE_SKILL_DIR variable — it exists only inside a SKILL.md (it would be substituted right here if spelled with dollar-brace syntax) and stays unset in plugin command bodies. Plugin files must be referenced via the CLAUDE_PLUGIN_ROOT variable. Check with:

```bash
grep -rn 'CLAUDE_SKILL_DIR' plugins/*/commands plugins/*/agents
```

Any match is a failure (report file and line).

## 6. Workflow-runtime scripts carry no imports/exports
Any script under `plugins/*/scripts/` containing the marker `// Workflow-runtime entry` is executed by the Workflow tool, which wraps the body in an async function — `import` statements and any `export` other than `export const meta` are a syntax error there. The unit tests cannot catch a regression (they append their own export line after stripping the marker), so check it here:

```bash
for f in $(rg -l -F '// Workflow-runtime entry' plugins/*/scripts 2>/dev/null); do
  rg -n '^import |^export ' "$f" | rg -v '^\d+:export const meta = \{$'
done
```

Any output is a failure (report file and line).

## 7. Summary
Print a summary with pass/fail for each check. If all checks pass, confirm everything is consistent. If any fail, list exactly what needs to be fixed.
