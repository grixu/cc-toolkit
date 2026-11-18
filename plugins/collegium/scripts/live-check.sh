#!/usr/bin/env bash
# Manual live check of collegium against real Codex: drives `claude -p` with this plugin loaded and
# prints each run's state and envelope. Needs `claude`, a logged-in `codex` enabled in /plugin
# configure, `git` and `jq`. Every run works in a scratch repository under a fresh temporary directory,
# which is kept so its logs can be read afterwards.
#
# Usage: live-check.sh [readonly] [branch] [skill] [timeout]   (no argument runs all four)
set -euo pipefail

plugin_dir="$(cd "$(dirname "$0")/.." && pwd)"
tools='mcp__collegium__collegium_run mcp__collegium__collegium_status mcp__collegium__collegium_result ToolSearch Skill'

for bin in claude codex git jq; do
  command -v "$bin" >/dev/null || { echo "live-check: $bin not found on PATH" >&2; exit 2; }
done

work="$(mktemp -d "${TMPDIR:-/tmp}/collegium-live.XXXXXX")"
failures=0

new_repo() {
  local repo="$work/$1"
  mkdir -p "$repo"
  git -C "$repo" init -q -b main
  printf '# %s\n\nA scratch repository for the collegium live check.\n' "$1" > "$repo/README.md"
  git -C "$repo" add -A
  git -C "$repo" -c user.name='collegium-live' -c user.email='collegium-live@localhost' \
    commit -q -m 'base' --no-gpg-sign
  printf '%s\n' "$repo"
}

# A run's `claude -p` session, with its stream-json transcript in <work>/<name>.jsonl.
drive() {
  local name="$1" repo="$2" prompt="$3"
  echo "== $name: claude -p in $repo"
  (cd "$repo" && claude -p "$prompt" --plugin-dir "$plugin_dir" --allowedTools "$tools" \
    --output-format stream-json --verbose) > "$work/$name.jsonl" || true
}

# Every result the session got from the tool whose name ends in $2, one JSON text per line.
tool_results() {
  jq -cs --arg tool "$2" '
    [ .[] | select(.type == "assistant") | .message.content[]?
      | select(.type == "tool_use" and (.name | endswith($tool))) | .id ] as $ids
    | .[] | select(.type == "user") | .message.content[]?
    | select(.type == "tool_result" and (.tool_use_id as $t | $ids | index($t)))
    | .content | if type == "array" then map(.text? // empty) | join("") else . end
  ' "$1"
}

show() {
  local log="$work/$1.jsonl" line
  while IFS= read -r line; do
    printf '%s: ' "$2"
    jq 'fromjson? // .' <<<"$line"
  done < <(tool_results "$log" "$2")
}

final_state() {
  tool_results "$work/$1.jsonl" collegium_result | tail -n 1 | jq -r 'fromjson? | .state // empty'
}

check() {
  if [ "$2" = "$3" ]; then echo "PASS $1: $2"; else echo "FAIL $1: got '${2:-none}', want '$3'"; failures=$((failures + 1)); fi
}

# report <name> <want-state> [extra tools]: prints the run's tool answers and checks its final state.
report() {
  local name="$1" want="$2" tool
  shift 2
  for tool in collegium_run "$@" collegium_result; do
    show "$name" "$tool"
  done
  check "$name" "$(final_state "$name")" "$want"
}

run_readonly() {
  local repo
  repo="$(new_repo readonly)"
  drive readonly "$repo" '/collegium:run --wait Read README.md and report its first line verbatim. Change no file.'
  report readonly 'done'
}

run_branch() {
  local repo
  repo="$(new_repo branch)"
  drive branch "$repo" '/collegium:run --wait --write branch Create the file hello.txt containing the single line "hello from collegium".'
  report branch 'done'
  echo "branches: $(git -C "$repo" branch --list 'collegium/*' | tr -d ' *' | tr '\n' ' ')"
  check branch-kept "$(git -C "$repo" branch --list 'collegium/*' | wc -l | tr -d ' ')" 1
  check worktree-removed "$(git -C "$repo" worktree list --porcelain | grep -c '^worktree ')" 1
}

run_skill() {
  local repo skill
  repo="$(new_repo skill)"
  skill="$work/skills/word-count/SKILL.md"
  mkdir -p "$(dirname "$skill")"
  cat > "$skill" <<'EOF'
---
name: word-count
description: Count the words in a file of the current repository.
---

Count the words in the file named here: $ARGUMENTS

Change no file. Report the file name and its word count in the summary.
EOF
  drive skill "$repo" "/collegium:run --wait --skill $skill README.md"
  report skill 'done'
}

# `/collegium:run` has no timeout flag, so this run calls the tools directly.
run_timeout() {
  local repo marker
  repo="$(new_repo timeout)"
  marker="collegium-live-timeout-$$"
  drive timeout "$repo" "Call mcp__collegium__collegium_run with task \"Run the shell command 'sleep 3600 # $marker' and wait for it to finish, then report done.\" and timeout_minutes 1. Then call mcp__collegium__collegium_result with its id and wait_seconds 20, then mcp__collegium__collegium_status with that id. Then call mcp__collegium__collegium_result with that id and wait_seconds 600, again each time it answers running, until it answers another state. Print each tool's answer verbatim."
  report timeout timeout collegium_status
  if pgrep -f "$marker" >/dev/null; then
    echo "FAIL process-gone: a process still matches $marker"
    failures=$((failures + 1))
  else
    echo "PASS process-gone"
  fi
}

runs=("$@")
[ ${#runs[@]} -gt 0 ] || runs=(readonly branch skill timeout)
for r in "${runs[@]}"; do
  case "$r" in
    readonly | branch | skill | timeout) "run_$r" ;;
    *) echo "live-check: unknown run '$r' (readonly, branch, skill, timeout)" >&2; exit 2 ;;
  esac
done

echo "logs and scratch repositories: $work"
[ "$failures" -eq 0 ]
