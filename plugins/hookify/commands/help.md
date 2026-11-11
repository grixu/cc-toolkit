---
description: Get help with the hookify plugin
allowed-tools: ["Read"]
---

# Hookify Plugin Help

Explain how the hookify plugin works and how to use it, using the content below. When the user asks
about a detail this page does not cover, read `${CLAUDE_PLUGIN_ROOT}/references/rule-syntax.md` and
answer from it.

## Overview

Hookify turns short markdown files into Claude Code hooks. Instead of editing `hooks.json`, you write a
rule file that says what to watch for and what message to show. Rules are read again on every hook
call, so a new or edited rule applies immediately, with no restart.

## Hook events

Hookify runs on four Claude Code hook events:

- **PreToolUse** and **PostToolUse**: before and after a tool call (Bash, Edit, Write, MultiEdit and
  any other tool)
- **Stop**: when Claude wants to finish its turn
- **UserPromptSubmit**: when you send a prompt

`bash` and `file` rules run both before and after the tool, so a warning can appear twice.

## Rule files and locations

| Type | File | Folder | Purpose |
|------|------|--------|---------|
| Personal, this project | `hookify.<name>.local.md` | `.claude/` | Your rules, gitignored |
| Team, this project | `hookify.<name>.rule.md` | `.claude/` | Committed, shared with the team |
| Personal, every project | `hookify.<name>.local.md` | `~/.claude/` | Your defaults |

Hookify reads them in that order, and the first rule to claim a `name` wins. A project `.local.md`
with the same `name` and `enabled: false` switches a team rule off for you. A `.rule.md` file in
`~/.claude/` is not read.

## Rule format

```markdown
---
name: warn-dangerous-rm
enabled: true
event: bash
pattern: rm\s+-rf
action: warn
---

**Dangerous rm command detected.** Verify the path before running it.
```

| Key | Meaning | Default |
|-----|---------|---------|
| `name` | Rule identifier, used in messages and overrides | `unnamed` |
| `enabled` | `true` or `false` | `true` |
| `event` | `bash`, `file`, `prompt`, `stop` or `all` | `all` |
| `action` | `block`, or `warn` | `warn` |
| `pattern` | One regex on the event's main field (`command`, `new_text`, `prompt`) | none |
| `conditions` | A list of `field` / `operator` / `pattern` checks; all must match. Replaces `pattern` | none |
| `tool_matcher` | Exact tool names, such as `Edit\|Write`, checked before the conditions | none |

The body below the frontmatter is the message. A rule with neither `pattern` nor `conditions` never
fires.

Operators: `regex_match` (the default, case-insensitive), `contains`, `not_contains`, `equals`,
`starts_with`, `ends_with`. Only `regex_match` understands `|`.

## What a match does

- **warn**: the message is shown and the operation goes ahead.
- **block** before a tool call: the call is denied and Claude gets the message as the reason.
- **block** after a tool call: the message is shown, but the tool has already run.
- **block** on stop: Claude keeps working, with the message as the reason.
- On a prompt, `block` behaves like `warn`: the prompt is not blocked.

## Commands

- **`/hookify:hookify [behavior]`**: create rules from a sentence, or from the recent conversation
  when you give no argument
- **`/hookify:list`**: list every configured rule
- **`/hookify:configure`**: switch rules on or off
- **`/hookify:review-changes`**: check your diff against the enabled `file` and `all` rules and report
  violations per rule
- **`/hookify:help`**: this page

## Examples

**Block a dangerous command:**

```markdown
---
name: block-chmod-777
enabled: true
event: bash
pattern: chmod\s+777
action: block
---

Don't use chmod 777. Set the specific permissions the file needs.
```

**Warn about debug logging in edits:**

```markdown
---
name: warn-console-log
enabled: true
event: file
pattern: console\.log\(
---

console.log detected. Remove debug logging before committing.
```

**Warn on edits to env files only:**

```markdown
---
name: warn-env-edits
enabled: true
event: file
tool_matcher: Edit|Write|MultiEdit
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.env$
---

You are editing an env file. Don't commit secrets.
```

Without `tool_matcher`, a `file_path` condition also fires when Claude reads the file.

**Require tests before stopping:**

```markdown
---
name: require-tests-run
enabled: true
event: stop
action: block
conditions:
  - field: transcript
    operator: regex_match
    pattern: ^(?![\s\S]*"command":\s*"[^"]*(npm test|pytest|cargo test))
---

No test run found in this session. Run the tests before finishing.
```

On `stop`, the `pattern` shorthand never matches, so stop rules need `conditions` on `transcript`.

## Troubleshooting

- **Rule missing from `/hookify:list`**: check the `hookify.` prefix, the `.local.md` or `.rule.md`
  suffix, the folder, and that the file starts with `---`.
- **Rule listed but silent**: check `event` and the field name. A field that resolves to nothing makes
  its condition fail, `not_contains` included. Test the regex with
  `python3 -c "import re; print(re.search(r'<pattern>', '<sample>', re.I))"`.
- **Backslashes in quotes**: write patterns unquoted. Inside double quotes, `\\` becomes `\`.
- **Python**: hookify needs Python 3.9 or later on `PATH`. If the hook fails, it blocks nothing.

## Getting started

1. Create a rule: `/hookify:hookify Warn me when I try to use rm -rf`
2. Trigger it: ask Claude to run `rm -rf /tmp/hookify-test`. The warning appears.
3. Refine the rule by editing its file in `.claude/`.

More examples are in `${CLAUDE_PLUGIN_ROOT}/examples/`.
