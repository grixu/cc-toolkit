# Project

This project is set of well-crafted Claude Code plugins.

## Rules of working

- ALWAYS find and read the current Claude Code documatation before you start creating a new plugin or updating the .claude-plugin/marketplace.json file
- ALWAYS prefer the order of creating scripts with:
  - Bash and commonly used tools
  - Node.js
  - Python
- ALWAYS show the missing questions, unresolved cases, edge cases that are not covered in skills, commands, scripts etc.
- ALWAYS use `./scripts/release.sh <plugin-name> <patch|minor|major>` for releasing plugins — do not perform release steps manually
