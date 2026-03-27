---
description: List all configured hookify rules
allowed-tools: ["Glob", "Read", "Skill"]
---

# List Hookify Rules

**Load hookify:writing-rules skill first** to understand rule format.

Show all configured hookify rules in the project.

## Steps

1. Use Glob tool to find all hookify rule files across all tiers:
   ```
   pattern: ".claude/hookify.*.local.md"
   pattern: ".claude/hookify.*.rule.md"
   pattern: "~/.claude/hookify.*.local.md"
   ```
   Note: For the global path, expand `~` to the user's home directory.

2. For each file found:
   - Use Read tool to read the file
   - Extract frontmatter fields: name, enabled, event, pattern
   - Extract message preview (first 100 chars)

3. Present results in a table:

```
## Configured Hookify Rules

| Name | Enabled | Event | Source | File |
|------|---------|-------|--------|------|
| warn-dangerous-rm | ✅ Yes | bash | project-rule | hookify.dangerous-rm.rule.md |
| warn-console-log | ✅ Yes | file | project-local | hookify.console-log.local.md |
| check-tests | ❌ No | stop | global-local | ~/.claude/hookify.require-tests.local.md |

**Total**: 3 rules (2 enabled, 1 disabled)

**Source types:**
- `project-rule` -- team rule (.rule.md, committed)
- `project-local` -- personal rule (.local.md, gitignored)
- `global-local` -- global personal rule (~/.claude/)
```

4. For each rule, show a brief preview:
```
### warn-dangerous-rm
**Event**: bash
**Pattern**: `rm\s+-rf`
**Message**: "⚠️ **Dangerous rm command detected!** This command could delete..."

**Status**: ✅ Active
**File**: .claude/hookify.dangerous-rm.local.md
```

5. Add helpful footer:
```
---

To modify a rule: Edit the .rule.md or .local.md file directly
To disable a rule: Set `enabled: false` in frontmatter
To enable a rule: Set `enabled: true` in frontmatter
To override a team rule: Create a .local.md with the same `name`
To delete a rule: Remove the rule file
To create a rule: Use `/hookify` command

**Remember**: Changes take effect immediately - no restart needed
```

## If No Rules Found

If no hookify rules exist:

```
## No Hookify Rules Configured

You haven't created any hookify rules yet.

To get started:
1. Use `/hookify` to analyze conversation and create rules
2. Or manually create `.claude/hookify.my-rule.rule.md` (team) or `.local.md` (personal) files
3. See `/hookify:help` for documentation

Example:
```
/hookify Warn me when I use console.log
```

Check `${CLAUDE_PLUGIN_ROOT}/examples/` for example rule files.
```
