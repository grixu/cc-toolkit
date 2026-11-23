# Docs: add merge-in-head to the docs site and fix README drift

## Context

dev-kit 0.13.0 shipped the `merge-in-head` skill (PR #77). The plugin README, `plugin.json` and
`marketplace.json` already describe it. The rest of the docs don't:

- The docs site (cct.grixu.dev) has no page for the skill. It isn't on the line map, in the dev-kit
  overview or reference, or in the human-review stage.
- The root `README.md` still says dev-kit has "Four small skills" and doesn't mention merge-in-head.
- In `plugins/dev-kit/README.md`, the Permissions row lists `git config`. Since `df44150e` the skill
  pre-approves only `git config --get`.
- On the site, `pr-open.mdx` (line 287) says "offers the sync as a separate step" and doesn't link
  to the skill that runs the sync. The README version of the same sentence does link to it.

`.claude/rules/docs.md` requires a plugin page under `docs/src/content/docs/plugins/` whenever a
plugin's behaviour changes, a Polish twin under `pl/` for every page, both languages in the same
commit, anti-slop on new prose, and `pnpm -C docs build` as the link check. The changelog page
builds itself from releases (`Releases.astro` → `releases()` in `docs/src/lib/lifecycle.ts`), so it
needs nothing.

**Placement on the map:** merge-in-head goes in Human review as a solid spur off `pr-shepherd`,
drawn like `grill-topic` off `build-spec`. You run it by hand when pr-shepherd stops on a
conflicting PR or pr-open reports the branch is behind. Dotted spurs mean "called by another skill"
(DESIGN.md), and no skill calls merge-in-head, so this one is solid. It doesn't belong in Maintain,
because it serves an open branch inside the cycle.

## Steps

Work on a new branch from `origin/main` (`docs/dev-kit-merge-in-head`). The current worktree branch
is merged and deleted on the remote.

- [x] **Map data.** In `docs/src/lib/lifecycle.ts`, add a `merge-in-head` skill after `ci-fix`:
  `plugin: 'dev-kit'`, `stage: 'human'`, `href: 'plugins/dev-kit/merge-in-head/'`, no `calledBy`,
  and `does` in EN and PL (e.g. "Merge the base into your branch and resolve the conflicts" /
  "Zmerguj bazę do swojego brancha i rozwiąż konflikty"). `StageCommands` and the dev-kit plugin
  map read this list.
- [x] **Map position.** In `docs/src/components/LifeMap.astro`, add `pos['merge-in-head']` above
  pr-shepherd (x 1110, a y clear of the pr-open feed labels at 28/66/104). Check how the
  `grill-topic` spur is drawn and reuse that path. If no generic spur path exists, extend the spur
  code to cover it. Confirm the label doesn't collide with `prepare-proof`/`code-story` or the map's
  right edge.
  Changed: placed below the line at (1150, 312), a solid spur leaving just before the merge marker.
  Spurs are hard-coded paths, and above pr-shepherd the spur would cross its label.
- [x] **Skill page.** Add `docs/src/content/docs/plugins/dev-kit/merge-in-head.mdx`, modelled on
  `pr-shepherd.mdx`: frontmatter (`skill: merge-in-head`, sidebar label), intro (when to use it),
  `<Strip cmd>`, usage examples (none / `develop` / PR number), a `SkillFlow` with the steps
  (find base → fetch → merge → resolve by intent → run checks → commit → push), base-resolution
  order, conflict resolution, stops (rebase in progress, detached HEAD, dirty tree; resumes an
  in-progress merge), the push option, the result block, and next steps. Source of truth:
  `plugins/dev-kit/skills/merge-in-head/SKILL.md` and the README section.
- [x] **dev-kit overview** (`plugins/dev-kit/index.mdx`): add a row to Table 1, change "Three
  skills work in human review" to four, and add one sentence on when merge-in-head comes in.
- [x] **Reference** (`plugins/dev-kit/reference.md`): add an Arguments row
  `[base branch | PR number]`, a `merge_auto_push` row in the options table, a Permissions row
  copied from the corrected README row, and a `## merge-in-head result` section with the block
  from SKILL.md.
- [x] **Cross-links:** link merge-in-head from `pr-open.mdx` (the "base has moved ahead" bullet),
  from `pr-shepherd.mdx` (the conflict stop: "run `/dev-kit:merge-in-head`"), from
  `lifecycle/human-review.mdx` (one line after step 3), and from `lifecycle/index.mdx` (a "Your pull
  request conflicts with its base" entry in the stuck list).
- [x] **Polish twins:** make the same edits under `docs/src/content/docs/pl/…`, including a new
  `pl/plugins/dev-kit/merge-in-head.mdx`.
- [x] **READMEs:** in root `README.md` line 90, change "Four" to "Five" and add the merge-in-head
  clause and its `Start with` command. In `plugins/dev-kit/README.md`, change the Permissions row to
  `config --get`.
- [x] **Prose pass:** run `/anti-slop:anti-slop` on the new page and the changed paragraphs, EN and
  PL.
- [x] **Commits:** `docs(dev-kit): …` for the site and dev-kit README, and `docs: …` for the root
  README. Open the PR with `/dev-kit:pr-open`.

## Verification

- `pnpm -C docs build`: links and anchors are valid, including the new `/plugins/dev-kit/merge-in-head/` and `/pl/…` pages.
- `pnpm -C docs dev`, then look at the landing map, the dev-kit page map and the human-review stage map in both light and dark themes, and at 375 px wide (the map scrolls). The new station must not cover any label.
- `node scripts/verify-plugins.mjs` (the READMEs changed).
- Grep EN and PL for `merge-in-head` to confirm each page has its twin.
