#!/usr/bin/env bash
# Builds the reviewed task branch: a worktree beside the repo, the branch overlay committed onto it,
# the task file pointed at this sandbox, and the branch head recorded outside the sandbox.
set -euo pipefail
: "${ORIGINS:?}"

branch=feat/product-groups
tree="app.worktrees/${branch//\//-}"
git -C app branch -q "$branch"
git -C app worktree add -q "../$tree" "$branch"
cp -R branch/. "$tree/"
rm -rf branch
git -C "$tree" add -A
git -C "$tree" -c user.name='fd3-evals' -c user.email='fd3-evals@localhost' \
  commit -q -m 'feat(config): parse PRODUCT_GROUPS at startup' --no-gpg-sign
git -C "$tree" rev-parse HEAD > "$ORIGINS/branch-head"

sed -i.bak "s#@@SANDBOX@@#$(pwd)#" tasks/0001-product-groups-config.md
rm tasks/0001-product-groups-config.md.bak
