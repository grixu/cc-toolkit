# Docs for jev-skill-suggestion and fast-jev-compaction

## Context

PR #79 added two plugins (released as 0.1.0) but changed no documentation outside their own
READMEs. The root `README.md` doesn't list them, and the docs site (cct.grixu.dev) has no page,
catalog card or changelog section for either. `.claude/rules/docs.md` requires a page for each
plugin under `docs/src/content/docs/plugins/`, with a Polish twin in the same commit.

Both are supporting plugins that run in every session with no command to type, like stop-sound.
So they follow stop-sound's pattern: one `index.mdx` page each, a `raw` entry in `lifecycle.ts`
with no `skills` entry, and a changelog section.

## Steps

- [x] Create branch `docs/jev-plugins` from `origin/main` in this worktree (`git switch -c docs/jev-plugins origin/main`). `feat/port-jev-mods` is already merged.
- [x] `README.md`: add a row for each plugin to the "Improve Claude Code itself" table. Use the description from `marketplace.json`; for "Start with", give `Runs on its own once installed`, plus `/jev-skill-suggestion:setup` for jev. Add rows to the Requirements table: jev needs Claude Code 2.1.278 or later, with an optional TypeSafe or Gemini key (without one, a built-in classifier picks); fast-jev needs a TypeSafe or Gemini key (without one, Claude Code's own summary runs).
- [x] `docs/src/lib/lifecycle.ts`: add two `raw` entries after `stop-sound` (`core: false`, empty `promise`, a short `desc` in EN and PL). There are no `skills` entries, so the catalog shows both as working in every session, like stop-sound.
- [x] `docs/src/content/docs/plugins/jev-skill-suggestion/index.mdx` and its `pl/` twin, modelled on `plugins/stop-sound/index.mdx` (frontmatter `group: start`, `sidebar.order: 1`). Distilled from `plugins/jev-skill-suggestion/README.md`, the sections are:
  - **Intro**, with the problem it solves.
  - **Where it works:** outside the lifecycle.
  - **Install and set up:** the five Quick start steps, including `setup` / `setup restore` and the warning to restore before uninstalling.
  - **Backends and keys:** TypeSafe, Gemini Decision, Gateway, built-in, with the key order and the Gemini limit of 2–255 options.
  - **How it decides:** the gate, the rerank and the thresholds.
  - **Checking that it works:** the transcript lines, the status row, `/skills` and `/context`.
  - **Privacy.**
  - **Options:** a table of the main options; the full list stays in the README.
  - **Next steps.**
- [x] `docs/src/content/docs/plugins/fast-jev-compaction/index.mdx` and its `pl/` twin, with these sections:
  - **Intro.**
  - **Where it works.**
  - **Install:** includes removing the upstream copy.
  - **Requirements and keys.**
  - **Options:** a table.
  - **How it works:** the 7 steps.
  - **When it falls back:** the cases where Claude Code's own summary runs instead.
  - **Privacy.**
  - **Limitations.**
  - **Next steps.**
- [x] `docs/src/content/docs/changelog/index.mdx` and `pl/changelog/index.mdx`: add `## jev-skill-suggestion` and `## fast-jev-compaction` sections with `<Releases plugin="…" limit={6} />`, after stop-sound.
- [x] Run `/anti-slop:anti-slop` on the new pages (EN and PL) and on the new README rows.
- [x] One commit per logical change: `docs: list jev-skill-suggestion and fast-jev-compaction in the README`, then `docs: add jev-skill-suggestion and fast-jev-compaction pages to the docs site`. The plan file goes in with the second.

## Out of scope (reported as follow-ups)

- collegium also has no page or catalog entry on the docs site.
- The plugin READMEs stay as they are.

## Verification

- `pnpm -C docs build`: the build must pass, and `starlight-links-validator` checks every link and anchor on the new pages.
- `node scripts/verify-plugins.mjs`: must still be green.
- Spot-check the built output: `/plugins/` lists both cards marked as supporting, `/pl/plugins/…` renders, and `/changelog/#jev-skill-suggestion` shows the 0.1.0 release.
