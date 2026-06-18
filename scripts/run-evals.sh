#!/usr/bin/env bash
# Run every plugin's promptfoo eval suite found at plugins/<name>/evals/promptfooconfig.yaml.
# Extra args are forwarded to `promptfoo eval` (e.g. --filter-pattern eval-3).
#
#   pnpm eval                          # run all suites
#   pnpm eval -- --filter-pattern e3   # forward args to promptfoo
#
# Deps (promptfoo + @anthropic-ai/claude-agent-sdk) are resolved from the root
# node_modules, so this must run from the repo root (it cd's there itself).
set -euo pipefail

# `pnpm eval -- <args>` forwards a literal "--" into the script; drop it so it isn't
# passed on to promptfoo (where "--" would end option parsing).
[ "${1:-}" = "--" ] && shift

cd "$(dirname "$0")/.."
shopt -s nullglob
configs=(plugins/*/evals/promptfooconfig.yaml)

if [ ${#configs[@]} -eq 0 ]; then
  echo "No eval suites found (plugins/*/evals/promptfooconfig.yaml)."
  exit 0
fi

bin="./node_modules/.bin/promptfoo"
if [ ! -x "$bin" ]; then
  echo "promptfoo not installed at root. Run: pnpm install" >&2
  exit 1
fi

status=0
for cfg in "${configs[@]}"; do
  name="$(basename "$(dirname "$(dirname "$cfg")")")"
  echo "==> ${name}  (${cfg})"
  if ! "$bin" eval -c "$cfg" --no-cache --no-share -o "/tmp/eval-${name}.json" "$@"; then
    echo "!! ${name} eval reported failures" >&2
    status=1
  fi
done

exit $status
