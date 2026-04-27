---
name: reviewing-hookify-compliance
description: Use this skill when the user asks to "review changes against hookify rules", "check hookify compliance", "audit my diff for hookify violations", "run hookify code review", "review the PR for hookify rules", or "scan my changes for the hookify ruleset". Performs a hookify-rules-aware code review of committed and/or uncommitted changes by partitioning files into rule-scoped groups and dispatching parallel subagents, then aggregates a per-rule violation report and offers to save it or enter Plan Mode for fixes.
version: 0.1.0
---

# Reviewing Hookify Compliance

IRON LAW: **Never review a file against a rule whose `file_path` filter excludes it. Never let two groups overlap on the same file. Always confirm scope with `AskUserQuestion` when both committed and uncommitted changes exist — do not silently pick one.**

This skill performs one specific job: **review changed code against the user's enabled hookify file/all rules and report which lines violate which rule.** It does not invent additional review dimensions (no general "code quality" comments, no security audit, no style preferences). The rule set is the authority.

## Workflow

```
Hookify Compliance Review Progress:

- [ ] Step 1: Detect changes ⛔ BLOCKING
- [ ] Step 2: Confirm scope with the user ⚠️ REQUIRED
- [ ] Step 3: Load enabled hookify rules
- [ ] Step 4: Build review groups (no file overlap)
- [ ] Step 5: Spawn parallel subagents (one per group)
- [ ] Step 6: Aggregate violations
- [ ] Step 7: Present report
- [ ] Step 8: Ask follow-up (save / Plan Mode / done) ⚠️ REQUIRED
```

## Step 1: Detect changes ⛔ BLOCKING

Run the changes script for **both** scopes to learn what exists:

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/review-changes/scripts/get_changes.py --scope uncommitted
python3 ${CLAUDE_PLUGIN_ROOT}/skills/review-changes/scripts/get_changes.py --scope committed
```

Inspect both `count` fields:

- Both zero → tell the user there is nothing to review and stop.
- Only one non-zero → use that scope automatically, skip Step 2.
- Both non-zero → continue to Step 2.

If `committed` errors with "could not resolve a base ref", offer to skip the committed half and proceed with uncommitted only — do not guess a base.

## Step 2: Confirm scope ⚠️ REQUIRED

Use `AskUserQuestion` with these options:

- **Uncommitted only** — working tree + index vs HEAD
- **Committed only** — HEAD vs base (auto-detected upstream / origin/main)
- **Both** — full diff from base to working tree (Recommended when both are non-empty)

Show the user the file counts you saw in Step 1 inside each option's `description`, e.g. _"Uncommitted: 4 files modified."_ Do NOT proceed without an answer.

Re-run `get_changes.py` with the chosen scope to get the canonical file list.

## Step 3: Load hookify rules

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/review-changes/scripts/list_rules.py
```

This emits all **enabled** rules with `event` in `{file, all}`. Bash, stop, and prompt rules are intentionally excluded — they cannot be checked against a static diff.

If `count` is `0`, tell the user there are no applicable hookify rules in scope and stop. Suggest creating one with `/hookify`.

## Step 4: Build review groups

Load `references/grouping-strategy.md` and follow its 5 steps:

1. Drop ineligible files (binary, generated/lock files unless explicitly targeted).
2. Compute `applicable_rules(file)` using the rule's `file_path_filters`.
3. Bucket files by their applicable-rules signature.
4. Cap groups at 5 files each — split larger buckets.
5. Verify invariants: every file in exactly one group; every group has ≥1 rule.

Bias toward more groups, not fewer. The user explicitly preferred this for parallelism on large PRs.

## Step 5: Spawn parallel subagents

Load `references/subagent-prompt.md` for the exact template.

For each group, build the subagent prompt by filling `{{RULES_JSON}}`, `{{FILES_LIST}}`, and `{{DIFFS}}`. Get the per-file content per the file's status:

- **Tracked file** (`untracked` is missing/false): `git diff <diff_args> -- <file>` (use `diff_args` from `get_changes.py`).
- **Untracked file** (`untracked: true`): `git diff` won't emit anything — read the file directly and synthesize a unified diff that treats the whole file as added (every line is a `+` line; line numbers start at 1).

**Send all `Agent` calls in a single message** to run them concurrently. Use `subagent_type: general-purpose`. Set a short `description` per group, e.g. _"Review 3 TS files vs 2 rules"_. The subagent must return the JSON `{"violations": [...]}` schema.

If any single group's diff payload looks larger than ~30k tokens, split it into per-file sub-groups before spawning.

## Step 6: Aggregate violations

Parse each subagent's JSON response. Combine into a single list. Deduplicate on `(rule_name, file, line)` — a rule can only fire once per line.

Index by `rule_name`. For every loaded rule (Step 3), record either its violations or "no violations found" — clean rules are reported too.

If a subagent's response isn't valid JSON, log the failure inline in the report under a "Subagent failures" section and continue. Do not retry silently.

## Step 7: Present the report

Load `references/report-format.md` for the exact markdown structure. Render the report directly in the conversation.

## Step 8: Follow-up ⚠️ REQUIRED

Use `AskUserQuestion` with these options:

- **Save report to file** — writes to `.claude/hookify-review-<YYYY-MM-DD>-<HHMM>.md` (counter-suffixed if needed)
- **Enter Plan Mode for fixes** — call `EnterPlanMode` directly with a fix plan grouped by file (see report-format.md "Plan Mode follow-up")
- **Done** — no further action

If the user picks Plan Mode and there are zero violations, skip `EnterPlanMode` and just confirm "no fixes needed".

## Anti-Patterns

Things to NOT do — these are the failure modes most likely to surface here:

- ❌ Silently picking a scope when both kinds of changes exist (always ask).
- ❌ Reviewing a file against every rule regardless of `file_path_filters` (defeats the partitioning step — wastes subagent time and produces false positives).
- ❌ Letting two groups share a file (duplicate work, conflicting violation reports).
- ❌ Bundling all files into one giant group (no parallelism).
- ❌ Reporting violations on context lines or `-` lines — only `+` lines count.
- ❌ Adding "general code review" comments not tied to a loaded rule.
- ❌ Retrying failed subagents silently — surface failures in the report.
- ❌ Calling `EnterPlanMode` without first asking via `AskUserQuestion`.
- ❌ Loading bash/stop/prompt rules — `list_rules.py` already filters them out, but never patch this back in.
- ❌ Editing rule files or the user's code as part of the review — review only.

## Pre-Delivery Checklist

Before showing the report:

- [ ] Did `get_changes.py` succeed for the chosen scope?
- [ ] Did `list_rules.py` return at least one rule (otherwise stopped at Step 3)?
- [ ] Does every file from Step 2's file list appear in exactly one group, or in the explicit "skipped" list?
- [ ] Is every group's rule list non-empty?
- [ ] Did every spawned subagent return parseable JSON (or is it noted in "Subagent failures")?
- [ ] Are violations deduplicated on `(rule_name, file, line)`?
- [ ] Does the report list **every** loaded rule — clean ones too — not just rules with violations?
- [ ] Did you ask the follow-up question (`AskUserQuestion`) before ending the turn?
