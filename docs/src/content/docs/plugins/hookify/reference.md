---
title: Reference
description: The rule file format, where rules live, which events and fields a rule can match, and the list, configure, and help commands.
group: reference
sidebar:
  order: 4
---

This page covers how hookify reads and applies rule files.
Start with [`/hookify:hookify`](/plugins/hookify/hookify/) to create a rule, and come here when a rule doesn't behave as you expect.

## Rule file

A rule is a Markdown file.
The YAML frontmatter says when the rule fires, and the body is the message.

| Key | Meaning | Default |
|---|---|---|
| `name` | Rule identifier, shown in messages and used for overrides | `unnamed` |
| `enabled` | `true` or `false`. Any other value counts as enabled | `true` |
| `event` | `bash`, `file`, `prompt`, `stop`, or `all` | `all` |
| `action` | `block` stops the action. Anything else is a warning | `warn` |
| `pattern` | Shorthand for one `regex_match` condition on the event's main field | none |
| `conditions` | A list of `field`, `operator`, and `pattern`. All must match. When the list has items, `pattern` is ignored | none |
| `tool_matcher` | Exact tool names separated by `\|`, such as `Edit\|Write`, or `*` for any tool. Checked before the conditions | none |

Table 1. Frontmatter keys.

A rule with neither `pattern` nor `conditions` never fires.
Rules without a `name` all become `unnamed`, so only the first of them loads.

## Where rules live

hookify reads rules from three places, highest priority first:

| File | Applies to | Commit it? |
|---|---|---|
| `<project>/.claude/hookify.<name>.local.md` | You, in this project | No. Add `.claude/*.local.md` to your `.gitignore` |
| `<project>/.claude/hookify.<name>.rule.md` | Everyone working on this project | Yes |
| `~/.claude/hookify.<name>.local.md` | You, in every project | Not in a project repository |

Table 2. Rule locations, highest priority first.

Within each place, files load in alphabetical order.
The first rule to claim a `name` wins, and later rules with the same `name` are skipped.
A disabled rule still claims its name.
To switch off a team rule for yourself, create a `.local.md` file with the same `name` and `enabled: false`.

hookify ignores files without the `hookify.` prefix or the `.local.md` or `.rule.md` suffix.
It doesn't read `.rule.md` files in `~/.claude/`.
The project folder is the directory Claude Code runs the hook in, normally where you started Claude Code, not the git root.
hookify reads every rule file again on each hook call, so changes apply immediately.

## Events

Each `event` value fires on a different moment:

| Event | Fires when | Main field for `pattern` | What `block` does |
|---|---|---|---|
| `bash` | Claude runs a Bash command | `command` | Denies the command |
| `file` | Claude calls Edit, Write, or MultiEdit | `new_text`, the text being written | Denies the edit |
| `prompt` | You submit a prompt | `prompt` | Shows the message. The prompt still goes through |
| `stop` | Claude finishes its turn | none: use `conditions` on `transcript` | Makes Claude keep working, with your message as the reason |
| `all` | Any of the above | `content`, file edits only | Same as the matching event |

Table 3. Events.

For tools other than Bash, Edit, Write, and MultiEdit, hookify checks `bash`, `file`, and `all` rules.
So a `file` rule whose only condition is on `file_path` also fires when Claude reads that file.
Add `tool_matcher: Edit|Write|MultiEdit` to limit it to edits.

## Fields

A condition's `field` can be:

- **Any key of the tool's input**, as Claude Code sends it, such as `command`, `file_path`, `content`, `new_string`, or `url`.
- **`transcript`:** the full text of the session transcript file. Empty when the file can't be read.
- **`prompt`, or its alias `user_prompt`:** the submitted prompt, on prompt submit only.
- **An alias** that reads the same thing across file tools:

| Field | Bash | Edit | Write | MultiEdit |
|---|---|---|---|---|
| `command` | the command | | | |
| `file_path` | | the path | the path | the path |
| `new_text`, `content` | | `new_string` | `content` | every edit's `new_string`, joined by spaces |
| `new_string` | | `new_string` | `content` | not available |
| `old_text`, `old_string` | | `old_string` | empty | not available |

Table 4. Field aliases per tool.

If a field resolves to nothing, the condition fails.
This holds for `not_contains` too: a missing field doesn't count as "doesn't contain."

## Operators

| Operator | Matches when | Case |
|---|---|---|
| `regex_match` | The Python regular expression matches anywhere in the field | Ignored |
| `contains` | The field contains the text | Sensitive |
| `not_contains` | The field doesn't contain the text | Sensitive |
| `equals` | The field equals the text exactly | Sensitive |
| `starts_with` | The field starts with the text | Sensitive |
| `ends_with` | The field ends with the text | Sensitive |

Table 5. Operators.

`operator` defaults to `regex_match`.
An unknown operator or an invalid regular expression never matches.

Only `regex_match` understands `|`.
`not_contains` with `npm test|pytest` looks for that exact string.
To require that none of several commands ran, use a negative lookahead, as in `examples/require-tests-stop.local.md`:

```markdown
---
name: require-tests-run
enabled: false
event: stop
action: block
conditions:
  - field: transcript
    operator: regex_match
    pattern: ^(?![\s\S]*"command":\s*"[^"]*(npm test|pytest|cargo test))
---

**Tests not detected in transcript!**
```

Listing 1. A stop rule that keeps Claude working until a test command runs

The rule ships disabled.
While it matches, Claude keeps working, until Claude Code ends the turn after eight forced continuations in a row.

## What a match does

| Hook | `warn` | `block` |
|---|---|---|
| Before a tool call | Claude Code shows the message, and the tool runs | The call is denied. Claude gets the blocking rules' messages as the reason, and you see `Hookify: Blocked operation by rule: <names>` |
| After a tool call | Claude Code shows the message | You see `Hookify: Blocked operation by rule: <names>`, but the tool has already run, so nothing is undone |
| Stop | Claude Code shows the message, and Claude stops | Claude keeps working, with the messages as the reason |
| Prompt submit | Claude Code shows the message | Same as `warn`: the prompt isn't blocked |

Table 6. What a matching rule does on each hook.

When several rules match, any `block` wins, and only the blocking rules' messages are sent.
Otherwise all warning messages are joined, each headed by the rule name.
`bash` and `file` rules run both before and after the tool, so a warning can appear twice.

## Patterns and quoting

hookify uses its own small frontmatter parser, not a full YAML library.

- Write patterns unquoted: `pattern: \s+` is the regular expression `\s+`.
- In double quotes, `\\` becomes `\` and `\"` becomes `"`. Other sequences, such as `\s`, stay as written.
- In single quotes, `''` becomes `'`, and backslashes stay.
- A `#` after a value is part of the value, not a comment.
- If the first line of a list item contains a comma, the parser reads it as `key: value, key: value`. Put a regular expression with commas on an indented line below the `-` line.
- The frontmatter must be the first thing in the file, and it must not contain `---` anywhere else.

This example from `examples/coding-standards.rule.md` uses double quotes, so each backslash is doubled:

```markdown
---
name: warn-typescript-any
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.tsx?$
  - field: new_text
    operator: regex_match
    pattern: ":\\s*any\\b|<any>"
---

**TypeScript `any` type detected!**
```

Listing 2. A file rule with two conditions

## Example rules

The plugin ships these rules in `examples/`.
Copy one into `.claude/` to use it:

| File | Rule | What it does |
|---|---|---|
| `dangerous-rm.rule.md`, `dangerous-rm.local.md` | `block-dangerous-rm` | Blocks Bash commands that match `rm\s+-rf` |
| `console-log-warning.local.md` | `warn-console-log` | Warns when an edit adds `console.log(` |
| `sensitive-files-warning.local.md` | `warn-sensitive-files` | Warns when Claude edits or reads `.env` files and paths containing `credentials` or `secrets` |
| `coding-standards.rule.md` | `warn-typescript-any` | Warns when a TypeScript edit adds an `any` type |
| `require-tests-stop.local.md` | `require-tests-run` | Disabled. Blocks stopping until the transcript shows `npm test`, `pytest`, or `cargo test` |

Table 7. Example rules in the plugin.

## Commands

### `/hookify:list`

Lists every rule from the three locations in a table with its name, status, event, source, and file.
For each rule it shows the pattern and the start of the message, then the total count of enabled and disabled rules.

### `/hookify:configure`

Lists your rules with their current state and lets you pick the ones to toggle.
For each rule you pick, it switches `enabled: true` to `enabled: false`, or back, in the rule file.
It changes only the `enabled` line.

### `/hookify:help`

Explains inside Claude Code how hookify works: events, rule locations, the frontmatter keys, what a match does, the commands, examples and troubleshooting.
For a detail it doesn't cover, it reads the plugin's full rule-syntax reference, the same content as this page.

To edit or delete a rule, edit or delete its file. There is no command for it.

## Requirements and limits

- hookify needs Python 3.9 or later, available as `python3` on your `PATH`.
- It fails open: if Python is missing or a hook crashes, the action goes ahead and Claude Code shows a `Hookify error` message.
- A rule file without valid frontmatter is skipped. The warning appears only in the Claude Code debug log.
- Every tool call starts Python twice and reads every rule file. Each run has a 10-second timeout, after which Claude Code continues without hookify's answer.

## Next steps

- [Create a rule with `/hookify:hookify`](/plugins/hookify/hookify/).
- [Review your changes against the rules](/plugins/hookify/review-changes/).
