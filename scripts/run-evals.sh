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
#   scripts/run-evals.sh fd3 implement     # implement group → promptfooconfig.implement.yaml
#   scripts/run-evals.sh fd3 implement-fix-cr
#                                          # one implement pattern: the two review-fixer scenarios
#   scripts/run-evals.sh fd3 split-baseline --trials 3
#                                          # 3 sequential trials, sandboxes reset before each
#   scripts/run-evals.sh fd3 split-baseline --model <model-id>
#                                          # A/B: another target model (default claude-opus-5-5);
#                                          # the grader stays pinned
#   pnpm eval:code-review -- eval-20       # same runner for code-review (plugin mode)
#   node scripts/eval-summary.mjs plugins/fd3/evals/.results/runs/<run>
#                                          # re-print a run's summary
#
# In plugin mode a pattern starting with "e2e" selects the e2e config (shared sandbox,
# maxConcurrency 1 forced by the config), one starting with "researcher" selects the
# network config and one starting with "implement" the implement config; anything else
# filters the default config. --trials <k> runs the selected
# config k times, one after another, resetting every sandbox before each trial; --repeat is
# rejected because its copies share one sandbox. --model <id> exports EVAL_TARGET_MODEL, which
# every config's target provider reads. Each run is archived in
# plugins/<name>/evals/.results/runs/<UTC>-<sha>[-dirty]/ (trial-<i>.json, meta.json with
# SHA, config, models and tool versions, summary.json from eval-summary.mjs), and
# .results/latest.json is the last trial's output — agent tests take minutes each, so
# triage reads the exported JSON instead of re-running. Run-all mode does none of this: it
# runs each suite once and writes /tmp/eval-<name>.json.
#
# Deps (promptfoo + @anthropic-ai/claude-agent-sdk) are resolved from the root
# node_modules, so this must run from the repo root (it cd's there itself).
set -euo pipefail

# pnpm forwards a literal "--" wherever it sits (`pnpm eval:code-review -- eval-20` arrives
# as `code-review -- eval-20`); drop every one so it neither hides the pattern nor reaches
# promptfoo, where "--" would end option parsing.
argv=()
for a in "$@"; do
  [ "$a" = "--" ] || argv+=("$a")
done
set -- ${argv[@]+"${argv[@]}"}

cd "$(dirname "$0")/.."

# An eval is one headless query: a subagent left running in the background reports after the
# result, so the graded turn ends on "waiting for the fork" with nothing written.
export CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1
# An eval measures the plugin at the CLI's default compaction point; an operator's compaction
# settings leak in through the env and move it, either compacting mid-skill or never.
unset CLAUDE_AUTOCOMPACT_PCT_OVERRIDE CLAUDE_CODE_AUTO_COMPACT_WINDOW DISABLE_AUTO_COMPACT DISABLE_COMPACT
# An operator's commit signing needs ~/.gnupg, which the eval sandbox denies, so every agent
# commit would exit 128; the env-based config overrides the operator's gitconfig for this run.
export GIT_CONFIG_COUNT=2
export GIT_CONFIG_KEY_0=commit.gpgsign GIT_CONFIG_VALUE_0=false
export GIT_CONFIG_KEY_1=tag.gpgsign GIT_CONFIG_VALUE_1=false

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

# Writes <run dir>/meta.json from the META_* env vars and the extra promptfoo args. The models are the ones the config
# pins (null when it leaves the CLI default); the ones that actually answered are in each
# trial's response metadata.
write_meta() {
  node --input-type=module - "$@" <<'JS'
import fs from 'node:fs';
import { createRequire } from 'node:module';

const env = process.env;
const pkgVersion = (name) => {
  try {
    return JSON.parse(fs.readFileSync(`node_modules/${name}/package.json`, 'utf8'));
  } catch {
    return null;
  }
};
const promptfoo = pkgVersion('promptfoo');
const sdk = pkgVersion('@anthropic-ai/claude-agent-sdk');

// The target model is an `{{ env.X | default("y") }}` template; promptfoo renders it at load.
const renderEnv = (value) =>
  typeof value === 'string'
    ? value.replace(/\{\{\s*env\.(\w+)\s*(?:\|\s*default\(\s*['"]([^'"]*)['"]\s*\))?\s*\}\}/g, (_, name, fallback) => env[name] || fallback || '')
    : value;

let target = null;
let grader = null;
try {
  // js-yaml is promptfoo's dependency, reachable only from its real (pnpm store) path.
  const yaml = createRequire(fs.realpathSync('node_modules/promptfoo/package.json'))('js-yaml');
  const config = yaml.load(fs.readFileSync(env.META_CONFIG, 'utf8'));
  target = (config.providers ?? []).map((p) => (typeof p === 'object' ? renderEnv(p.config?.model) ?? null : null));
  const g = config.defaultTest?.options?.provider;
  grader = g === undefined ? null : typeof g === 'string' ? g : g.config?.model ?? null;
} catch (err) {
  console.error(`meta.json: could not read models from ${env.META_CONFIG}: ${err.message}`);
}

const meta = {
  git_sha: env.META_SHA,
  git_dirty: env.META_DIRTY === 'true',
  config: env.META_CONFIG,
  filter_pattern: env.META_PATTERN || null,
  extra_args: process.argv.slice(2),
  trials: Number(env.META_TRIALS),
  trial_exit_codes: env.META_EXIT_CODES ? env.META_EXIT_CODES.split(' ').map(Number) : [],
  configured_target_model: target,
  target_model_override: env.EVAL_TARGET_MODEL || null,
  configured_grader_model: grader,
  promptfoo_version: promptfoo?.version ?? null,
  claude_agent_sdk_version: sdk?.version ?? null,
  claude_code_version: sdk?.claudeCodeVersion ?? null,
  started_at: env.META_STARTED,
  ended_at: env.META_ENDED || null,
};
fs.writeFileSync(`${env.META_RUN_DIR}/meta.json`, `${JSON.stringify(meta, null, 2)}\n`);
JS
}

# Plugin mode: first arg names a plugin with an evals dir.
if [ $# -ge 1 ] && [ -f "plugins/${1}/evals/promptfooconfig.yaml" ]; then
  plugin="$1"
  shift
  evals_dir="plugins/${plugin}/evals"

  # promptfoo's --repeat runs every copy of a scenario against the one sandbox it was reset
  # into, concurrently — the copies see and delete each other's writes. A trial is a whole
  # run after its own reset.
  trials=1
  args=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --trials) trials="${2:-}"; shift 2 || { echo "--trials needs a count" >&2; exit 2; } ;;
      --trials=*) trials="${1#--trials=}"; shift ;;
      --model) model="${2:-}"; shift 2 || { echo "--model needs a model id" >&2; exit 2; } ;;
      --model=*) model="${1#--model=}"; shift ;;
      --repeat|--repeat=*)
        echo "--repeat shares one sandbox across copies of a scenario; use --trials <k> (a fresh sandbox per trial)" >&2
        exit 2 ;;
      *) args+=("$1"); shift ;;
    esac
  done
  if ! [[ "$trials" =~ ^[1-9][0-9]*$ ]]; then
    echo "--trials needs a positive integer, got '${trials}'" >&2
    exit 2
  fi
  # The configs read the target model from EVAL_TARGET_MODEL; the grader stays pinned.
  if [ -n "${model+set}" ]; then
    [ -n "$model" ] || { echo "--model needs a model id" >&2; exit 2; }
    export EVAL_TARGET_MODEL="$model"
  fi
  set -- ${args[@]+"${args[@]}"}

  cfg="${evals_dir}/promptfooconfig.yaml"
  filter=()
  if [ $# -ge 1 ] && [[ "$1" != -* ]]; then
    pattern="$1"
    shift
    case "$pattern" in
      e2e*) cfg="${evals_dir}/promptfooconfig.e2e.yaml" ;;
      researcher*) cfg="${evals_dir}/promptfooconfig.network.yaml" ;;
      implement*) cfg="${evals_dir}/promptfooconfig.implement.yaml" ;;
    esac
    filter=(--filter-pattern "$pattern")
  fi

  results_dir="${evals_dir}/.results"
  dirty=false
  [ -n "$(git status --porcelain 2>/dev/null)" ] && dirty=true
  sha="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
  run_dir="${results_dir}/runs/$(date -u +%Y%m%dT%H%M%SZ)-${sha:0:7}"
  [ "$dirty" = true ] && run_dir+="-dirty"
  mkdir -p "$run_dir"
  started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  export META_RUN_DIR="$run_dir" META_SHA="$sha" META_DIRTY="$dirty" META_CONFIG="$cfg" \
    META_PATTERN="${pattern:-}" META_TRIALS="$trials" META_STARTED="$started"
  # Written up front too, so an interrupted run still says what it was.
  write_meta "$@"

  status=0
  exit_codes=()
  for ((i = 1; i <= trials; i++)); do
    [ "$trials" -gt 1 ] && echo "--- trial ${i}/${trials}"
    reset_sandbox "$evals_dir"
    rc=0
    run_suite "$plugin" "$cfg" "${run_dir}/trial-${i}.json" ${filter[@]+"${filter[@]}"} "$@" || rc=$?
    exit_codes+=("$rc")
    [ "$status" -eq 0 ] && status=$rc
    # A trial that crashed before exporting must not leave the previous run's file to triage.
    rm -f "${results_dir}/latest.json"
    if [ -f "${run_dir}/trial-${i}.json" ]; then
      cp "${run_dir}/trial-${i}.json" "${results_dir}/latest.json"
    fi
  done
  META_EXIT_CODES="${exit_codes[*]}" META_ENDED="$(date -u +%Y-%m-%dT%H:%M:%SZ)" write_meta "$@"
  echo "==> results archived in ${run_dir}"
  node scripts/eval-summary.mjs "$run_dir" || echo "!! eval-summary.mjs failed; trials are still in ${run_dir}" >&2
  # A sandbox whose seccomp helper cannot arm fails every Bash call, and agents work around a dead
  # shell well enough to pass, so the run is void however it scored.
  if grep -l 'apply-seccomp:' "${run_dir}"/trial-*.json >/dev/null 2>&1; then
    echo "!! the sandbox could not arm (apply-seccomp failed in a Bash call); the run is void" >&2
    status=3
  fi
  exit "$status"
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
