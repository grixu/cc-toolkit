#!/usr/bin/env bash
# Builds the task branch the CI runner grades: a worktree beside the repo, the branch overlay
# committed onto it, the task file pointed at this sandbox, and the branch head recorded outside it.
set -euo pipefail
: "${ORIGINS:?}"

branch=feat/queue-status
tree="app.worktrees/${branch//\//-}"
git -C app branch -q "$branch"
git -C app worktree add -q "../$tree" "$branch"
cp -R branch/. "$tree/"
rm -rf branch
git -C "$tree" add -A
git -C "$tree" -c user.name='fd3-evals' -c user.email='fd3-evals@localhost' \
  commit -q -m 'feat(queue): add the queue status script' --no-gpg-sign
git -C "$tree" rev-parse HEAD > "$ORIGINS/branch-head"

sed -i.bak "s#@@SANDBOX@@#$(pwd)#" tasks/0001-queue-status-script.md
rm tasks/0001-queue-status-script.md.bak
