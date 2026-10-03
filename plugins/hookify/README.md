# hookify

Turn "don't do X" into a rule Claude Code enforces. You describe the behavior, in a sentence or by
pointing at a mistake Claude just made, and hookify writes a small markdown rule file. Its built-in
hooks read those files on every tool call and either show a warning or block the action. You never
edit `settings.json` or write a hook script.

This is a fork of the official [hookify plugin](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/hookify).
See [What this fork adds](#what-this-fork-adds).

## Install

In Claude Code, run:

```
/plugin marketplace add grixu/cc-toolkit
/plugin install hookify@cc-toolkit
```

Hookify needs Python 3.9 or later, available as `python3` on your `PATH`. It has no other dependencies.

## Quick start

1. Ask for a rule:

   ```
   /hookify:hookify Block rm -rf
   ```

   Claude asks whether to warn or block and whether the rule is for the team or just you, then writes
   a rule file such as `.claude/hookify.block-rm-rf.rule.md` (team) or
   `.claude/hookify.block-rm-rf.local.md` (you).

2. Try it. You do not need to restart: hookify re-reads the rule files on every tool call.

   ```
   Run rm -rf /tmp/hookify-test
   ```

   Claude Code shows `Hookify: Blocked operation by rule: block-rm-rf`, and the command does not run.
   Claude receives the rule's message as the reason.

Run `/hookify:hookify` with no arguments to have Claude scan the current conversation for things you
corrected and propose rules for them.

## What a rule looks like

A rule is a markdown file. The YAML frontmatter says when the rule fires; the body is the message.

```markdown
---
name: block-rm-rf
enabled: true
event: bash
pattern: rm\s+-rf
action: block
---

Do not run rm -rf. Delete specific files by name, or ask the user first.
```

To check more than one thing, use `conditions`. A rule fires only when every condition matches.

```markdown
---
name: warn-hardcoded-secret
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.tsx?$
  - field: new_text
    operator: regex_match
    pattern: (API_KEY|SECRET|TOKEN)\s*=\s*["']
---

Read secrets from environment variables, not string literals.
```

| Key | Values | Default |
|-----|--------|---------|
| `name` | Unique name. Also used to override a rule (see below) | `unnamed` |
| `enabled` | `true`, `false` | `true` |
| `event` | `bash`, `file`, `prompt`, `stop`, `all` (see below) | `all` |
| `action` | `warn` shows the message and lets the action run; `block` stops it | `warn` |
| `pattern` | A regular expression checked against the event's main field | none |
| `conditions` | A list of `field`, `operator`, `pattern` | none |

| Event | Fires when | Main field for `pattern` | Other fields | What `block` does |
|-------|------------|--------------------------|--------------|-------------------|
| `bash` | Claude runs a Bash command | `command` | none | Denies the command |
| `file` | Claude calls Edit, Write or MultiEdit | `new_text` (the text being written) | `file_path`, `old_text` (Edit only) | Denies the edit |
| `prompt` | You submit a prompt | `prompt` | none | Shows the message; the prompt still goes through |
| `stop` | Claude finishes its turn | none, use `conditions` | `transcript` (the whole session log) | Makes Claude keep working, with your message as the reason |
| `all` | Any of the above | `content` (file edits only) | any of the above | Same as the matching event |

Patterns are Python regular expressions. They match anywhere in the field and ignore case. The other
operators, `contains`, `not_contains`, `equals`, `starts_with` and `ends_with`, compare literal text
and are case-sensitive.

Write patterns unquoted, as in the examples above. Inside double quotes, write `\\` for each
backslash, as YAML requires.

Every field, operator and parser rule is in [references/rule-syntax.md](references/rule-syntax.md).
Ready-made rules are in [examples/](examples/).

## Where rules live

| File | Applies to | Commit it? |
|------|------------|-----------|
| `<project>/.claude/hookify.<name>.local.md` | You, in this project | No. Add `.claude/*.local.md` to your `.gitignore` |
| `<project>/.claude/hookify.<name>.rule.md` | Everyone working on this project | Yes |
| `~/.claude/hookify.<name>.local.md` | You, in every project | Not in a project repository |

Hookify ignores files without the `hookify.` prefix or the `.local.md` / `.rule.md` suffix. When two
rules share a `name`, the one higher in the table wins. To switch off a team rule for yourself, create a
`.local.md` file with the same `name` and `enabled: false`.

`/hookify:hookify` writes project rules only. Create rules in `~/.claude/` by hand.

## Commands

| Command | What it does |
|---------|--------------|
| `/hookify:hookify [behavior]` | Creates rules from your description, or from the conversation when run without arguments |
| `/hookify:list` | Lists every rule with its event, status and source file |
| `/hookify:configure` | Lets you pick rules to enable or disable |
| `/hookify:help` | Explains hookify inside Claude Code |
| `/hookify:review-changes` | Reviews your diff against your rules (see below) |

To edit or delete a rule, edit or delete its file. The change applies on the next tool call.

### Review a diff against your rules

Run `/hookify:review-changes`, or ask "review my changes against hookify rules". Claude checks
committed and uncommitted changes against every enabled `file` and `all` rule, using parallel
subagents, and reports violations per rule. It can then save the report to
`.claude/hookify-review-<date>-<time>.md` or open Plan Mode with a plan to fix them. It skips `bash`,
`prompt` and `stop` rules, because a diff cannot trigger them.

## What this fork adds

Compared with the upstream plugin in
[anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/hookify):

- Team and global rules. Upstream reads only `.claude/hookify.*.local.md`. This fork adds committed
  `.rule.md` team rules, global rules in `~/.claude/`, and overrides by `name` between them.
- Clearer block output. When a rule blocks a tool call, Claude gets the rule's message as the reason,
  and you see which rule blocked it.
- Diff review with `/hookify:review-changes`.
- Fixes. `prompt` rules match the prompt text, `file` patterns check new files created with Write,
  `stop` and `prompt` rules no longer fire on tool calls, and double-quoted patterns follow YAML
  escaping.
- Plugin paths that contain spaces work.

Upstream changes are merged regularly. See [CHANGELOG.md](CHANGELOG.md).

## Limits

- Hookify fails open. If Python is missing or a hook crashes, the action goes ahead and Claude Code
  shows a `Hookify error` message. A rule file without valid frontmatter is skipped without a message.
- Warn rules on `bash` and `file` fire twice: before the tool runs and after.
- A `file` rule whose only condition is on `file_path` also fires when Claude reads that file, because
  hookify checks every rule against tools other than Bash, Edit, Write and MultiEdit. Add
  `tool_matcher: Edit|Write|MultiEdit` to the frontmatter to limit it to edits.
- A `stop` rule that keeps matching keeps Claude working until Claude Code stops it after eight
  forced continuations in a row.

## Troubleshooting

If a rule does not fire:

1. Run `/hookify:list`. If the rule is missing, check the file name and folder.
2. Check that it says `enabled: true` and that no rule higher in the priority order has the same `name`.
3. Test the pattern on a sample string:

   ```
   python3 -c "import re; print(re.search(r'rm\s+-rf', 'rm -rf x', re.I))"
   ```

   It prints `None` when the pattern does not match.

## License

MIT
