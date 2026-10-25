#!/usr/bin/env bash
# Points every task at this sandbox's repo, commits that, and gives the repo an origin so step 1's
# fetch has something to fetch and main tracks origin/main.
set -euo pipefail
: "${ORIGINS:?}"

repo="$(pwd)/app"
for f in app/docs/specs/queue-status/tasks/*.md; do
  sed -i.bak "s#@@REPO@@#${repo}#" "$f"
  rm "$f.bak"
done
git -C app add -A
git -C app -c user.name='fd3-evals' -c user.email='fd3-evals@localhost' \
  commit -q -m 'docs(queue-status): point the tasks at this checkout' --no-gpg-sign

git clone -q --bare app "$ORIGINS/app.git"
git -C app remote add origin "$ORIGINS/app.git"
git -C app fetch -q origin
git -C app branch -q --set-upstream-to=origin/main main
