# Report Format

The final report is shown to the user (and optionally saved to disk).

## Structure

```markdown
# Hookify Compliance Review

**Scope:** {{scope}} ({{file_count}} files, {{rule_count}} rules, {{group_count}} groups)
**Base:** {{base_ref_or_none}}
**Date:** {{ISO date}}

## Summary

- ✅ Clean rules: N
- ⚠️  Rules with violations: M
- 🛑 Total violations: K across F files

---

## ⚠️  Rule: `<rule-name>` ({{action}})

> _{{rule.message — first line, trimmed to ~120 chars}}_

**Source:** `{{rule.source}}`

### Violations

- `path/to/file.ts:42` — _Adds console.log to production source._
  ```
  console.log(user)
  ```
- `other/file.tsx:88` — _...
  ```
  console.log("debug")
  ```

---

## ✅ Rule: `<rule-name>` ({{action}})

No violations found in {{N}} reviewed files.

---

## Files reviewed

<details>
<summary>{{N}} files</summary>

- `src/api/users.ts` (M)
- `src/api/posts.ts` (A)
- ...

</details>

## Files skipped

<details>
<summary>{{N}} files</summary>

- `pnpm-lock.yaml` — generated/lock file, no rule explicitly targets it
- `assets/logo.png` — binary

</details>
```

## Section order

1. Header (scope, base, counts, date)
2. Summary
3. **All rules with violations first**, sorted by violation count (descending)
4. Then clean rules (no violations)
5. Files reviewed (collapsible)
6. Files skipped (collapsible)

## Rendering rules

- Use `⚠️` for rules with violations, `✅` for clean rules
- Use `action: block` rules' header marker `🛑` instead of `⚠️` to flag severity
- Truncate the rule message preview at the first newline or 120 chars,
  whichever comes first
- Always show the absolute path of the rule source — the user may want to
  jump to it and edit

## When saving to disk

Default path: `.claude/hookify-review-<YYYY-MM-DD>-<HHMM>.md`

If a file with that name already exists, append a counter: `-2`, `-3`, ...

## Plan Mode follow-up

If the user picks "Enter Plan Mode for fixes", call `EnterPlanMode` and
draft a plan structured per file:

```
1. src/api/users.ts (3 violations)
   - Remove console.log on line 42 (rule: warn-console-log)
   - Replace `any` with proper type on line 17 (rule: no-any-typescript)
   - ...
2. src/ui/Btn.tsx (1 violation)
   - ...
```

Group by file, not by rule — the user fixes files, not rules.
