# Rule syntax reference

The full behavior of hookify rule files. Start with the [README](../README.md); come here when a rule
does not behave as you expect.

## File names and loading

Hookify reads rules from three places, in this order:

1. `.claude/hookify.*.local.md` in the current working directory: your rules for this project
2. `.claude/hookify.*.rule.md` in the current working directory: team rules for this project
3. `~/.claude/hookify.*.local.md`: your rules for every project

Within each place, files load in alphabetical order. The first rule to claim a `name` wins; later rules
with the same `name` are skipped. A disabled rule still claims its name, which is how a `.local.md`
file with `enabled: false` switches off a team rule.

Rules without a `name` all become `unnamed`, so only the first of them loads. A `.rule.md` file in
`~/.claude/` is not read.

The project folder is the directory Claude Code runs the hook in, normally where you started Claude
Code. Hookify does not look for the git root.

Hookify re-reads every rule file on each hook call, so changes apply immediately.

## Frontmatter keys

| Key | Meaning | Default |
|-----|---------|---------|
| `name` | Rule identifier, shown in messages and used for overrides | `unnamed` |
| `enabled` | `true` or `false`. Any other value counts as enabled | `true` |
| `event` | `bash`, `file`, `prompt`, `stop` or `all` | `all` |
| `action` | `block`, or anything else for a warning | `warn` |
| `pattern` | Shorthand for one `regex_match` condition on the event's main field | none |
| `conditions` | List of conditions; all must match. When the list has items, `pattern` is ignored | none |
| `tool_matcher` | Exact tool names separated by `\|`, such as `Edit\|Write`, or `*` for any tool. Checked before the conditions | none |

A rule with neither `pattern` nor `conditions` never fires.

## Events

Claude Code runs hookify on four hook events. This table shows which rules each one evaluates.

| Hook event | Rules evaluated |
|------------|-----------------|
| PreToolUse, PostToolUse for Bash | `bash` and `all` |
| PreToolUse, PostToolUse for Edit, Write, MultiEdit | `file` and `all` |
| PreToolUse, PostToolUse for any other tool | `bash`, `file` and `all` |
| UserPromptSubmit | `prompt` and `all` |
| Stop | `stop` and `all` |

The third row means a `file` rule whose only condition is on `file_path` also fires when Claude reads
the file, and a `bash` or `file` rule can match another tool's input field of the same name. Add
`tool_matcher` to prevent that.

## The `pattern` shorthand

`pattern: <regex>` becomes one `regex_match` condition on this field:

| `event` | Field |
|---------|-------|
| `bash` | `command` |
| `file` | `new_text` |
| `prompt` | `prompt` |
| `stop`, `all` | `content` |

`content` exists only for Edit, Write and MultiEdit, so on `all` the shorthand checks file edits only,
and on `stop` it never matches. Use `conditions` with `field: transcript` for stop rules.

## Fields

Hookify resolves a condition's `field` in this order:

1. Any key of the tool's input, as Claude Code sends it, such as `command`, `file_path`, `content`,
   `new_string` or `url`.
2. Hook-level fields:
   - `transcript`: the full text of the session transcript file (JSON lines, one per message). Empty if
     the file cannot be read.
   - `prompt`, or its alias `user_prompt`: the submitted prompt (UserPromptSubmit only).
   - `reason`: always empty. Claude Code does not send it.
3. Aliases per tool:

   | Field | Bash | Edit | Write | MultiEdit |
   |-------|------|------|-------|-----------|
   | `command` | the command | | | |
   | `file_path` | | the path | the path | the path |
   | `new_text`, `content` | | `new_string` | `content` | every edit's `new_string`, joined by spaces |
   | `new_string` | | `new_string` | `content` | not available |
   | `old_text`, `old_string` | | `old_string` | empty | not available |

If a field resolves to nothing, the condition fails. This holds for `not_contains` too: a missing field
does not count as "does not contain".

## Operators

| Operator | Matches when | Case |
|----------|--------------|------|
| `regex_match` | The Python regular expression matches anywhere in the field (`re.search`) | Ignored |
| `contains` | The field contains the text | Sensitive |
| `not_contains` | The field does not contain the text | Sensitive |
| `equals` | The field equals the text exactly | Sensitive |
| `starts_with` | The field starts with the text | Sensitive |
| `ends_with` | The field ends with the text | Sensitive |

`operator` defaults to `regex_match`. An unknown operator or an invalid regex never matches.

Only `regex_match` understands `|`. `not_contains: npm test|pytest` looks for that exact string. To
require that none of several alternatives appear, use a negative lookahead with `regex_match`:

```yaml
conditions:
  - field: transcript
    operator: regex_match
    pattern: ^(?![\s\S]*"command":\s*"[^"]*(npm test|pytest|cargo test))
```

This matches while no Bash call in the transcript has run one of the three commands.

## What a match does

| Hook event | `warn` | `block` |
|------------|--------|---------|
| PreToolUse | Claude Code shows the message; the tool runs | The tool call is denied. Claude gets the messages of the blocking rules as the reason; you see `Hookify: Blocked operation by rule: <names>` |
| PostToolUse | Claude Code shows the message | Same output as PreToolUse, but the tool has already run, so nothing is undone |
| Stop | Claude Code shows the message; Claude stops | Claude keeps working, with the messages as the reason. Claude Code ends the turn after eight forced continuations in a row |
| UserPromptSubmit | Claude Code shows the message | Same as `warn`: the prompt is not blocked |

Warnings use the hook output field `systemMessage`, which the Claude Code hooks reference describes as
a message shown to the user.

When several rules match, any `block` wins and only the blocking rules' messages are sent. Otherwise
all warning messages are joined, each headed by the rule name.

## Frontmatter parser

Hookify uses its own small parser, not a full YAML library. It supports:

- `key: value` lines starting at column 0
- `true` and `false` (any case) as booleans; every other value is a string
- a key with an empty value followed by a list of `- ` items; each item is a plain value or a
  `key: value` map, with further keys indented by at least three spaces
- lines that start with `#`, which are skipped

Quoting:

- Unquoted values are used as written, so `pattern: \s+` is the regex `\s+`. Prefer this form.
- Double-quoted values turn `\\` into `\` and `\"` into `"`, as YAML does. Other sequences, such as
  `\s`, stay as written.
- Single-quoted values turn `''` into `'` and keep backslashes.

Limits:

- A `#` after a value is part of the value, not a comment.
- If the first line of a list item contains a comma, the parser reads the line as
  `key: value, key: value`. Keep regexes with commas on an indented line below the `-` line.
- The frontmatter must be the first thing in the file. It must not contain `---` anywhere else, not
  even inside a value.

## Reviewing a diff: how `/hookify:review-changes` works

1. Lists committed changes (against the detected base branch) and uncommitted changes, and asks which
   to review when both exist.
2. Loads enabled `file` and `all` rules. It skips `bash`, `prompt` and `stop` rules.
3. Splits the changed files into groups by the rules that apply to them, with each file in exactly one
   group.
4. Starts one subagent per group in parallel. Each returns violations as JSON.
5. Reports violations per rule, and lists rules with no violations too.
6. Offers to save the report to `.claude/hookify-review-<YYYY-MM-DD>-<HHMM>.md` (with a numeric
   suffix if the name is taken) or to open Plan Mode with a fix plan grouped by file.

## Troubleshooting

- Rule missing from `/hookify:list`: check the `hookify.` prefix, the `.local.md` or `.rule.md`
  suffix, the folder, and that the file starts with `---`. Files the parser cannot read are skipped,
  with a warning only in the Claude Code debug log.
- Rule listed but silent: check `event`, the field name, and whether a missing field makes the
  condition fail. Test the regex with
  `python3 -c "import re; print(re.search(r'<pattern>', '<sample>', re.I))"`.
- Message appears twice: `bash` and `file` rules run both before and after the tool.
- Slow tool calls: every tool call starts Python twice and reads every rule file. Each run has a
  10-second timeout; after that Claude Code continues without hookify's answer.
