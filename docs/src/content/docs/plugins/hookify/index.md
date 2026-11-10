---
title: hookify
description: Turns "don't do X" into a rule that Claude Code enforces, with a warning or a block, without editing settings or writing hook scripts.
---

When Claude repeats a mistake, a correction in chat doesn't stop it next time.
hookify turns your description, or a mistake Claude has made, into a small Markdown rule file.
Its built-in hooks read those files on every tool call and show a warning or block the action.

## Install

```
/plugin install hookify@cc-toolkit
```

hookify needs Python 3.9 or later, available as `python3` on your `PATH`.

## What it does

| Command or skill | What it does |
|---|---|
| `/hookify:hookify [behavior]` | Creates rules from your description. Without arguments, it scans the current conversation for things you corrected and proposes rules for them. |
| `/hookify:list` | Lists every rule with its event, status, and source file. |
| `/hookify:configure` | Lets you pick rules to enable or disable. |
| `/hookify:help` | Explains hookify inside Claude Code. |
| `/hookify:review-changes` | Reviews your committed and uncommitted changes against your enabled `file` and `all` rules, and reports violations per rule. Also starts when you ask to review your changes against hookify rules. |
| Rule hooks | Run on their own on every tool call, prompt, and end of turn. They apply the rules that match the event. |

Rules live in `.claude/hookify.<name>.rule.md` for the team, or `.claude/hookify.<name>.local.md` for you only.
`/hookify:hookify` writes project rules only; create rules in `~/.claude/` by hand.
To edit or delete a rule, edit or delete its file.

This plugin is a fork of the official [hookify plugin](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/hookify).
It adds team and global rules, clearer block output, and diff review.

## Usage

- Run `/hookify:hookify Block rm -rf`. Claude asks whether to warn or block and who the rule is for, then writes the rule file.
- Ask Claude to `Run rm -rf /tmp/hookify-test`. You don't need to restart. Claude Code shows `Hookify: Blocked operation by rule: block-rm-rf`, and the command doesn't run.
- Run `/hookify:hookify` with no arguments after a session where you corrected Claude. It proposes rules for those corrections.
- Run `/hookify:review-changes` on a branch with changes. It can save the report or open Plan Mode with a plan to fix the violations.

The [plugin README](https://github.com/grixu/cc-toolkit/blob/main/plugins/hookify/README.md) has every option.
The [rule syntax reference](https://github.com/grixu/cc-toolkit/blob/main/plugins/hookify/references/rule-syntax.md) lists every field and operator.
