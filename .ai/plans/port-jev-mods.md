# Port jev-skill-suggestion and fast-jev-compaction into the marketplace

Goal: both mods ship as plugins of `grixu/cc-toolkit`, read the TypeSafe key from the environment
(so `_cc_ccs_jev` can stop passing it on the command line, where `ps` shows it), and can use
Gemini Decision (`gemini-decision-1`) as a backend.

Sources: jev-skill-suggestion v0.1.0 from davila7/claude-code-templates (MIT, installed copy in
`~/.claude/skills/jev-skill-suggestion`), fast-jev-compaction 0.3.0 from tamaratran/fast-jev-compaction
(MIT, e3f262a, plugin cache). Both licences are MIT: keep each LICENSE/copyright and credit the
upstream in README and CHANGELOG.

## Steps

- [x] Import `plugins/jev-skill-suggestion/` verbatim from upstream (first commit, so later diffs show our changes).
      Added upstream's LICENSE, which the installed copy lacked.
- [x] Import `plugins/fast-jev-compaction/` verbatim, without `node_modules`, `demo/`, lockfile and tsconfigs.
      Also dropped the npm-only `client.ts`, `messages.ts`, `examples/`, `types/` and `hooks/README.md`; imports moved to `.ts`.
- [x] Key lookup, both plugins: option → `TYPESAFE_API_KEY` (as fast-jev and dev-kit; literal `$.env.get` names, mods-runtime rule).
- [x] Gemini backend, both plugins: copy dev-kit's `hooks/decision.ts` + `hooks/providers/` (identical copies, as in pr-proof);
      key option `geminiApiKey` → `GEMINI_DECISIONS_API_KEY` → `GEMINI_API_KEY`.
  - [x] jev-skill-suggestion: add `gemini` to `provider` (auto order: typesafe → gemini → gateway → builtin).
        Gemini rejects question IDs outside `[A-Za-z0-9_-]{1,64}` (found live), so questions travel as `q0…` and answers are mapped back.
  - [x] fast-jev-compaction: add a `backend` option (auto|typesafe|gemini); keep/drop nouls go to Gemini as `noul`.
- [x] Port fast-jev's vitest tests to `claude-code/testing`; add tests for the env-key order and the Gemini mapping.
- [x] plugin.json (author grixu, repository, keywords), CHANGELOG `[Unreleased]`, README, marketplace.json entries;
      descriptions reviewed by the reader and ai-pattern agents (two rounds).
- [x] Docs site pages if `.claude/rules/docs.md` requires one per plugin. — Not required (only existing pages must be kept current; collegium has none); left as a follow-up.
- [ ] `/verify`, one commit per step, PR. Release only on request. — Verified and committed; push and PR await the user.

Live checks (2026-11-24): Gemini answered the skill-suggestion ranking and rerank in 234–328 ms, and a
fast-jev compaction dropped an unrelated Read while keeping the failing test's Bash call.

## Outside the repo (user's call, listed as follow-ups)

- dotfiles: drop the `--settings` key arg in `functions.zsh:119-126` and the mod install at `claude.sh:74-76`;
  remove `~/.claude/skills/jev-skill-suggestion` and the upstream fast-jev install, or each hook runs twice.
- Re-key `pluginConfigs` in `~/.ccs/shared/settings.json` from `jev-skill-suggestion@skills-dir` to `@cc-toolkit`.
- Rotate the TypeSafe key: it appeared in `ps` and in another session's tool output.
