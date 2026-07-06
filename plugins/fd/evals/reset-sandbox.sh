#!/usr/bin/env bash
# Reset the fd eval sandboxes. fd commands MUTATE their working dir, so every eval run
# operates on a throwaway copy under evals/.sandbox/<scenario>/ (git-ignored) — never on
# the pristine fixtures/ sources, and never on the repo itself. Wired as a pre-step into
# `pnpm eval:fd` / `pnpm eval:fd:config`; safe to run by hand between iterations.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sandbox="$here/.sandbox"

rm -rf "$sandbox"
mkdir -p "$sandbox"
for scenario in config start staleness; do
  # cp -R of the whole dir carries hidden entries (each fixture ships a .claude/).
  cp -R "$here/fixtures/$scenario" "$sandbox/$scenario"
done

echo "fd evals: sandbox reset -> $sandbox"
