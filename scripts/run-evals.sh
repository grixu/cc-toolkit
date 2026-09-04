#!/usr/bin/env bash
# Run promptfoo eval suites found at plugins/<name>/evals/promptfooconfig.yaml.
#
#   pnpm eval                              # run every suite's default config
#   pnpm eval -- --filter-pattern split    # forward args to promptfoo (all suites)
#   scripts/run-evals.sh fd3               # one suite: reset sandboxes, run, export results
#   scripts/run-evals.sh fd3 "validate-defective|split-baseline|write-missing-input|grill-round|build-spec-gate"
#                                          # smoke group via --filter-pattern
#   scripts/run-evals.sh fd3 e2e           # e2e chain → promptfooconfig.e2e.yaml (serial)
#   scripts/run-evals.sh fd3 researcher    # researcher group → promptfooconfig.network.yaml
#
# In plugin mode a pattern starting with "e2e" selects the e2e config (shared sandbox,
# maxConcurrency 1 forced by the config — never run it with --repeat) and one starting
# with "researcher" selects the network config; anything else filters the default config.
# Results always land in plugins/<name>/evals/.results/latest.json — agent tests take
# minutes each, so triage reads the exported JSON instead of re-running.
#
# Deps (promptfoo + @anthropic-ai/claude-agent-sdk) are resolved from the root
# node_modules, so this must run from the repo root (it cd's there itself).
set -euo pipefail

# `pnpm eval -- <args>` forwards a literal "--" into the script; drop it so it isn't
# passed on to promptfoo (where "--" would end option parsing).
[ "${1:-}" = "--" ] && shift

cd "$(dirname "$0")/.."

bin="./node_modules/.bin/promptfoo"
if [ ! -x "$bin" ]; then
  echo "promptfoo not installed at root. Run: pnpm install" >&2
  exit 1
fi

run_suite() {
  local name="$1" cfg="$2" out="$3"
  shift 3
  mkdir -p "$(dirname "$out")"
  echo "==> ${name}  (${cfg})"
  "$bin" eval -c "$cfg" --no-cache --no-share -o "$out" "$@"
}

# A suite whose commands mutate their working dir ships a reset script; without it the suite
# runs against the previous run's leftovers and can score green on work it never did. Suites
# name that script either way.
reset_sandbox() {
  local dir="$1" script
  for script in "${dir}/reset-sandboxes.sh" "${dir}/reset-sandbox.sh"; do
    if [ -x "$script" ]; then
      bash "$script"
      return
    fi
  done
}

# Plugin mode: first arg names a plugin with an evals dir.
if [ $# -ge 1 ] && [ -f "plugins/${1}/evals/promptfooconfig.yaml" ]; then
  plugin="$1"
  shift
  evals_dir="plugins/${plugin}/evals"

  reset_sandbox "$evals_dir"

  cfg="${evals_dir}/promptfooconfig.yaml"
  filter=()
  if [ $# -ge 1 ] && [[ "$1" != -* ]]; then
    pattern="$1"
    shift
    case "$pattern" in
      e2e*) cfg="${evals_dir}/promptfooconfig.e2e.yaml" ;;
      researcher*) cfg="${evals_dir}/promptfooconfig.network.yaml" ;;
    esac
    filter=(--filter-pattern "$pattern")
  fi

  run_suite "$plugin" "$cfg" "${evals_dir}/.results/latest.json" "${filter[@]}" "$@"
  exit $?
fi

# Run-all mode: every plugin's default config (e2e/network configs stay explicit-only).
shopt -s nullglob
configs=(plugins/*/evals/promptfooconfig.yaml)

if [ ${#configs[@]} -eq 0 ]; then
  echo "No eval suites found (plugins/*/evals/promptfooconfig.yaml)."
  exit 0
fi

status=0
for cfg in "${configs[@]}"; do
  evals_dir="$(dirname "$cfg")"
  name="$(basename "$(dirname "$evals_dir")")"
  reset_sandbox "$evals_dir"
  if ! run_suite "$name" "$cfg" "/tmp/eval-${name}.json" "$@"; then
    echo "!! ${name} eval reported failures" >&2
    status=1
  fi
done

exit $status
