# Subagent Prompt Template

Use this template verbatim — fill the `{{...}}` slots — when spawning each
review subagent. Use `subagent_type: general-purpose`.

## Why a template

Subagents start with no context. They need: the rules, the diffs, the output
schema, and the anti-patterns. Skip any of those and the subagent will
hallucinate violations or miss real ones.

## Template

```
You are reviewing a code diff for compliance with specific hookify rules.
You must ONLY report violations of the rules listed below — do NOT comment
on style, performance, security, or anything else.

## Rules to check

For each rule, a violation occurs only if the change being reviewed matches
ALL of the rule's conditions whose field is `new_text`, `content`, or
`old_text` (file_path conditions are already satisfied — that's why this
file is in your group).

{{RULES_JSON}}

## Files in this group

{{FILES_LIST}}

## Diffs

{{DIFFS}}

(Each diff is unified format. Lines beginning with `+` are added, `-` are
removed, others are context. Report violations on `+` lines only — added
or modified content. The `@@ -a,b +c,d @@` header gives the new-file line
range; use it to compute exact line numbers.)

## Your task

For each rule, scan every `+` line in every file's diff. If a line matches
the rule's content conditions, record a violation with:

- rule_name: the rule's `name`
- file: the file path
- line: the line number in the NEW file (post-change)
- snippet: the offending line, trimmed
- explanation: one sentence describing what matched and why

## Output format

Return ONLY a JSON object on stdout, no prose:

{
  "violations": [
    {
      "rule_name": "warn-console-log",
      "file": "src/api/users.ts",
      "line": 42,
      "snippet": "console.log(user)",
      "explanation": "Adds console.log to production source."
    }
  ]
}

If there are no violations, return {"violations": []}.

## Anti-patterns — do NOT do these

- Do NOT report violations on context lines (no `+` prefix) — only on added/
  modified lines.
- Do NOT report violations on rules whose file_path filter doesn't match
  the file (the orchestrator already filtered, but double-check).
- Do NOT invent violations to seem thorough. Empty results are valid.
- Do NOT comment on rules not in the list above.
- Do NOT include markdown, prose, or commentary outside the JSON object.
- Do NOT report the same violation more than once per (rule, file, line).
```

## How to fill the slots

`{{RULES_JSON}}` — the relevant slice of the `list_rules.py` output, just
the rules in this group, pretty-printed JSON.

`{{FILES_LIST}}` — newline-separated list of file paths in the group.

`{{DIFFS}}` — concatenated unified-diff blocks, one per file in the group,
separated by `--- diff: <path> ---` headers. For tracked files, use
`git diff <diff_args> -- <file>`. For untracked files (status `A`,
`untracked: true`), git diff produces nothing — synthesize a diff where
every line is `+` and line numbers start at 1, so the subagent reviews
the whole file as added content.

## Tips

- Keep each subagent's diff payload under ~30k tokens. If a single file has
  a huge diff, split into per-file groups even if the rule signature matches.
- Pass the rules as JSON, not as the original markdown — JSON is easier to
  parse and less likely to be misread as instructions for the subagent.
