# Short plugin descriptions

## Context

The `/plugin` view lists each plugin's `description`. Several are far too long: code-review runs
to ~250 words, tester, researcher, pr-proof and session-learner to 50–100. The goal is a rule that a
plugin description has at most two sentences and always goes through compound-writing review
(`cw-scribe` → `cw-reader` → `cw-ai-check`), plus applying that rule to all 15 current plugins.

Found along the way: `marketplace.json` and `plugin.json` already disagree for **tester** (different
text) and **feature-delivery** (only the marketplace says "Deprecated — use fd3"). The rule makes
them identical.

## Steps

- [x] **Add the rule to `CLAUDE.md`** under "Plugin Structure" (always loaded, so it applies when a
  new plugin is created or a description is edited, not only when a manifest is read):
  - `description` in `plugin.json` and in the plugin's `marketplace.json` entry: at most two
    sentences, identical in both files, English.
  - It says what the plugin does for the user, not how it works inside (no lens lists, model names,
    tool chains); detail belongs in the README.
  - Every new or changed description goes through `/compound-writing:cw-scribe` (draft from the
    README), `/compound-writing:cw-reader` (cold read as a Claude Code user scanning `/plugin`), and
    `/compound-writing:cw-ai-check`, repeating until reader and ai-check raise nothing that matters.
  - A deprecated plugin opens with "Deprecated — use <successor>."
- [ ] **Draft all 15 descriptions in one batch** with `cw-scribe`, writing to a scratchpad file
  (one block per plugin: name, current text, README "What it does" row as source, draft). The root
  README table (`README.md:57-92`) is the best source: it is already written for users.
- [ ] **Run `cw-reader` once over the whole batch**, audience: a developer browsing `/plugin` who has
  never seen these plugins. Revise flagged drafts.
- [ ] **Run `cw-ai-check` once over the whole batch.** Revise flagged drafts; re-run reader/ai-check
  on anything changed substantially.
- [ ] **Show the final 15 descriptions to the user for approval** (table: plugin, old length, new text)
  before writing them.
- [ ] **Write the approved text** into each `plugins/<name>/.claude-plugin/plugin.json` and the
  matching entry in `.claude-plugin/marketplace.json` with `Edit`.
- [ ] **Commit** surgically: `docs: limit plugin descriptions to two sentences` (CLAUDE.md rule), then
  `chore: shorten plugin descriptions` (manifests). No version bumps.
- [ ] Delete the scratchpad batch file; nothing scratch gets committed.

## Out of scope

- No script or CI check counting sentences (fragile, and not asked for); the rule plus the review
  loop carries it.
- The README tables and per-plugin READMEs stay as they are.
- No releases. `marketplace.json` text reaches users on a marketplace update; `plugin.json` text only
  ships with each plugin's next release.

## Verification

- `jq` over `marketplace.json` and every `plugin.json`: for each plugin, the two descriptions are
  byte-identical, and each has ≤2 sentence-ending periods.
- `claude plugin validate .` (and per plugin) passes.
- `/reload-plugins` in a session pointed at this worktree's marketplace, then `/plugin` → each entry
  fits in a line or two.
