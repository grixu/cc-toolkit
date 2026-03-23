---
name: new-plugin
description: Scaffold a new Claude Code plugin with all required files and register it in the marketplace
disable-model-invocation: true
---

# New Plugin Scaffold

Create a new plugin in this monorepo. Use `$ARGUMENTS` as the plugin name. If no name is provided, ask the user for one.

## Before starting

1. Read the current Claude Code plugin documentation to ensure the scaffold follows the latest format
2. Confirm the plugin name doesn't already exist in `plugins/`
3. Ask the user for:
   - A short description of what the plugin does
   - Which components it needs: commands, hooks, skills, agents (at minimum, ask about commands and hooks)
   - The plugin category (e.g., productivity, security, testing)
   - Keywords/tags for discoverability

## Create the plugin structure

Create `plugins/<name>/` with:

### Required files

1. **`.claude-plugin/plugin.json`**:
   ```json
   {
     "name": "<name>",
     "version": "0.1.0",
     "description": "<description>",
     "author": {
       "name": "grixu",
       "email": "mateusz.gostanski@gmail.com"
     },
     "repository": "https://github.com/grixu/cc-toolkit",
     "keywords": [<tags>]
   }
   ```

2. **`CHANGELOG.md`** using Keep a Changelog format:
   ```markdown
   # Changelog

   All notable changes to the **<name>** plugin will be documented in this file.

   The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
   and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

   ## [Unreleased]

   ### Added

   - Initial release
   ```

3. **`README.md`** with plugin name, description, installation, and usage sections

### Optional directories

Create based on user's answers:
- `commands/` — for slash command definitions (`.md` files)
- `hooks/` — for hook implementations (prefer Bash scripts, then Node.js, then Python)
- `skills/` — for skill definitions
- `agents/` — for agent definitions

## Register in marketplace

Add the new plugin entry to `.claude-plugin/marketplace.json` in the `plugins` array:
```json
{
  "name": "<name>",
  "source": "./plugins/<name>",
  "description": "<description>",
  "version": "0.1.0",
  "author": {
    "name": "Mateusz Gostański (grixu)",
    "email": "mateusz.gostanski@gmail.com"
  },
  "category": "<category>",
  "tags": [<tags>]
}
```

## After creation

1. Run `/verify` to confirm everything is consistent
2. Show the user what was created and suggest next steps
