---
name: release
description: Release one plugin, or every plugin with unreleased changes, from this monorepo — bump the version, stamp the changelog, tag, push and create the GitHub release. Use only when the user asks for a release.
---

# Release a plugin

`scripts/release.sh <plugin-name> <patch|minor|major>` does the whole release: bumps the
version in `plugin.json` and `marketplace.json`, bumps the marketplace's top-level
`version` by the same level, stamps `## [Unreleased]` in `CHANGELOG.md` with the version
and today's date, commits, tags `<plugin>/vX.Y.Z` and `marketplace/vX.Y.Z`, and pushes
`HEAD:main` plus both tags and creates the GitHub release. Never do any of these steps by
hand.

## Run it from a detached worktree of `origin/main`

```bash
git -C <repo> fetch origin main
git -C <repo> worktree add --detach <scratchpad>/release origin/main
CI=true <scratchpad>/release/scripts/release.sh <plugin-name> <patch|minor|major>
git -C <repo> worktree remove <scratchpad>/release
```

The script works on the checkout it lives in, whatever the current directory.

Why a fresh worktree: `main` is usually checked out by the user's main checkout, other
sessions may leave local commits there, and the script refuses unless `HEAD` equals
`origin/main`. Never release from the main checkout or a feature branch.

Why `CI=true`: the script asks two `read -rp` confirmations, and an agent shell has no
TTY, so `read` gets EOF and `set -e` aborts the run after it has printed the version plan.
`CI=true` answers both `y`. Never pipe `y`/`n` into the script.

`CI=true` also answers the push prompt, so a run is not reversible once it starts. Do the
preflight first. The user asking for the release is the go-ahead.

## Preflight

All five are `die` conditions inside the script; the only non-fatal item is `gh` in
item 4. Hitting one after a partial run is worse than checking first.

1. `## [Unreleased]` exists in `plugins/<name>/CHANGELOG.md` **and is not empty**.
2. `.claude-plugin/marketplace.json` has a top-level `version`
   (`jq -e '.version' .claude-plugin/marketplace.json`).
3. Neither tag you are about to create exists: `<plugin>/vX.Y.Z` and
   `marketplace/vX.Y.Z`, the marketplace version bumped by the same level
   (`git tag --list '<plugin>/vX.Y.Z' 'marketplace/vX.Y.Z'` prints nothing).
4. `jq` and `git` are on PATH. `gh` is **optional**: without it the script pushes the
   commit and both tags and prints `gh CLI not found — skipping GitHub Release`. Do not block
   a release on `gh`; just say the GitHub Release will be missing.
5. The PR with the changes is merged, so `origin/main` contains them.

## Every plugin with unreleased changes

When the user asks to release everything unreleased:

1. List plugins whose `CHANGELOG.md` has a non-empty `## [Unreleased]`.
2. Pick the level per plugin: `minor` when the section has `### Added`, otherwise `patch`.
   `major` only when the user says so.
3. Release them one at a time. Before each, `git fetch origin main` and move the worktree
   to the new `origin/main` (`git -C <worktree> checkout --detach origin/main`), since the
   previous release pushed a commit. Stop on the first failure and report which plugins
   were released.

## After

Report each new version, tag and the GitHub release URL the script printed. Do not
re-run `verify` for version parity: the script is what writes that parity.
