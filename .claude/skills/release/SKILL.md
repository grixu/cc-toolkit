---
name: release
description: Release a single plugin from this monorepo — bump version, stamp the changelog, tag, push, and create the GitHub release
disable-model-invocation: true
---

# Release a plugin

`scripts/release.sh <plugin-name> <patch|minor|major>` does the whole release: bumps the
version in `plugin.json` and `marketplace.json`, stamps `## [Unreleased]` in
`CHANGELOG.md` with the version and today's date, commits, tags `<plugin>/vX.Y.Z`, and
pushes plus creates the GitHub release.

## Always run it with `CI=true`

```bash
CI=true ./scripts/release.sh <plugin-name> <patch|minor|major>
```

The script asks two `read -rp` confirmations. An agent shell has no TTY, so `read` gets
EOF, and because the script runs under `set -euo pipefail` that failure aborts it — after
it has already printed the version plan, which reads like progress. Every run without
`CI=true` is a wasted run. `CI=true` is the script's own documented non-interactive path:
it answers both prompts `y`.

Because `CI=true` also auto-answers the **push** prompt, the run is not reversible once
it starts. Do the preflight below first, and get the user's go-ahead before invoking it —
that confirmation replaces the prompts you just suppressed.

## Preflight

Check these before running; each one is a `die` inside the script, and hitting it after a
partial run is worse than checking first.

1. `## [Unreleased]` exists in `plugins/<name>/CHANGELOG.md` **and is not empty** — the
   script refuses on either.
2. The tag `<plugin>/vX.Y.Z` for the version you are about to create does not exist
   (`git tag --list '<plugin>/*' | tail -5`).
3. `jq`, `git`, and `gh` are on PATH; `gh auth status` is clean.
4. The working tree is clean and you are on the branch you mean to release from — the
   script commits and pushes whatever it stamps.

## After

Report the new version, the tag, and the GitHub release URL the script printed. Do not
re-run `verify` for version parity: the script is what writes that parity.
