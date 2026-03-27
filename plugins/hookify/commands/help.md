---
description: Get help with the hookify plugin
allowed-tools: ["Read"]
---

# Hookify Plugin Help

Explain how the hookify plugin works and how to use it.

## Overview

The hookify plugin makes it easy to create custom hooks that prevent unwanted behaviors. Instead of editing `hooks.json` files, users create simple markdown configuration files that define patterns to watch for.

## How It Works

### 1. Hook System

Hookify installs generic hooks that run on these events:
- **PreToolUse**: Before any tool executes (Bash, Edit, Write, etc.)
- **PostToolUse**: After a tool executes
- **Stop**: When Claude wants to stop working
- **UserPromptSubmit**: When user submits a prompt

These hooks read rule files from multiple locations and check if any rules match the current operation.

### 2. Rule Types and Locations

Hookify supports two file extensions and two locations:

| Type | Extension | Location | Git | Purpose |
|------|-----------|----------|-----|---------|
| Team rule | `.rule.md` | `.claude/` | Committed | Shared project rules |
| User-local | `.local.md` | `.claude/` | Ignored | Personal project rules |
| Global | `.local.md` | `~/.claude/` | N/A | Personal defaults |

**Priority (highest first):**
1. Project `.local.md` -- overrides everything
2. Project `.rule.md` -- team/project rules
3. Global `~/.claude/*.local.md` -- user global defaults

If two rules share the same `name`, the higher-priority tier wins. You can override a team rule by creating a `.local.md` with the same name and `enabled: false`.

### 3. Configuration Files

Users create rules in `.claude/hookify.{rule-name}.rule.md` (team) or `.local.md` (personal) files:

```markdown
---
name: warn-dangerous-rm
enabled: true
event: bash
pattern: rm\s+-rf
---

⚠️ **Dangerous rm command detected!**

This command could delete important files. Please verify the path.
```

**Key fields:**
- `name`: Unique identifier for the rule
- `enabled`: true/false to activate/deactivate
- `event`: bash, file, stop, prompt, or all
- `pattern`: Regex pattern to match

The message body is what Claude sees when the rule triggers.

### 3. Creating Rules

**Option A: Use /hookify command**
```
/hookify Don't use console.log in production files
```

This analyzes your request and creates the appropriate rule file.

**Option B: Create manually**
Create `.claude/hookify.my-rule.rule.md` (team) or `.claude/hookify.my-rule.local.md` (personal) with the format above.

**Option C: Analyze conversation**
```
/hookify
```

Without arguments, hookify analyzes recent conversation to find behaviors you want to prevent.

## Available Commands

- **`/hookify`** - Create hooks from conversation analysis or explicit instructions
- **`/hookify:help`** - Show this help (what you're reading now)
- **`/hookify:list`** - List all configured hooks
- **`/hookify:configure`** - Enable/disable existing hooks interactively

## Example Use Cases

**Prevent dangerous commands:**
```markdown
---
name: block-chmod-777
enabled: true
event: bash
pattern: chmod\s+777
---

Don't use chmod 777 - it's a security risk. Use specific permissions instead.
```

**Warn about debugging code:**
```markdown
---
name: warn-console-log
enabled: true
event: file
pattern: console\.log\(
---

Console.log detected. Remember to remove debug logging before committing.
```

**Require tests before stopping:**
```markdown
---
name: require-tests
enabled: true
event: stop
pattern: .*
---

Did you run tests before finishing? Make sure `npm test` or equivalent was executed.
```

## Pattern Syntax

Use Python regex syntax:
- `\s` - whitespace
- `\.` - literal dot
- `|` - OR
- `+` - one or more
- `*` - zero or more
- `\d` - digit
- `[abc]` - character class

**Examples:**
- `rm\s+-rf` - matches "rm -rf"
- `console\.log\(` - matches "console.log("
- `(eval|exec)\(` - matches "eval(" or "exec("
- `\.env$` - matches files ending in .env

## Important Notes

**No Restart Needed**: Hookify rules take effect immediately on the next tool use. The hookify hooks are already loaded and read your rules dynamically.

**Block or Warn**: Rules can either `block` operations (prevent execution) or `warn` (show message but allow). Set `action: block` or `action: warn` in the rule's frontmatter.

**Team vs Personal**: Use `.rule.md` for team rules (committed to repo) and `.local.md` for personal rules (gitignored). Global personal rules go in `~/.claude/`.

**Override Team Rules**: Create a `.local.md` with the same `name` as a `.rule.md` rule to override it. Set `enabled: false` to disable a team rule for yourself.

**Disable Rules**: Set `enabled: false` in frontmatter or delete the file.

## Troubleshooting

**Hook not triggering:**
- Check rule file is in `.claude/` directory (or `~/.claude/` for global rules)
- Verify `enabled: true` in frontmatter
- Confirm pattern is valid regex
- Test pattern: `python3 -c "import re; print(re.search('your_pattern', 'test_text'))"`
- Rules take effect immediately - no restart needed

**Import errors:**
- Check Python 3 is available: `python3 --version`
- Verify hookify plugin is installed correctly

**Pattern not matching:**
- Test regex separately
- Check for escaping issues (use unquoted patterns in YAML)
- Try simpler pattern first, then refine

## Getting Started

1. Create your first rule:
   ```
   /hookify Warn me when I try to use rm -rf
   ```

2. Try to trigger it:
   - Ask Claude to run `rm -rf /tmp/test`
   - You should see the warning

4. Refine the rule by editing its `.rule.md` or `.local.md` file

5. Create more rules as you encounter unwanted behaviors

For more examples, check the `${CLAUDE_PLUGIN_ROOT}/examples/` directory.
