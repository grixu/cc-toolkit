#!/usr/bin/env bash
#
# index-guard.sh — build a zvec-grep index and stop it the moment zg falls back
#                  from the GPU to the CPU.
#
# Usage:
#   index-guard.sh <root> [zg --index options...]
#
# zg (0.3.x) switches a llama.cpp model to the CPU for the rest of the process
# after any failed GPU embedding, including one bad input, and an interrupted
# first build keeps nothing. A CPU build of a large repo takes hours, so the
# guard kills it on the first fallback warning instead of letting it run.
#
# Before the build it appends text files that contain NUL bytes (llama.cpp
# cannot tokenize them) to <root>/.zgignore, and always passes that file to zg.
#
# Environment:
#   ZG_INDEX_LOG      Log file (default: $TMPDIR/zg-index-<dir>-<time>.log)
#   ZG_INDEX_RETRIES  Restarts after a fallback whose cause is not the input (default: 1)
#
# Exit codes: zg's own code when the build ends by itself, 2 for usage or a
# concurrent build, 3 when the build fell back to the CPU and was stopped.

set -euo pipefail

die() { printf 'index-guard: %s\n' "$1" >&2; exit 2; }

[[ $# -ge 1 && -d "$1" ]] || die "usage: index-guard.sh <root> [zg --index options...]"
command -v zg >/dev/null || die "zg is not installed"

root="$(cd "$1" && pwd -P)"
shift

if pgrep -f "zg.exe --index $root( |$)" >/dev/null; then
  die "another zg --index is already running for $root"
fi

tmp_dir="${TMPDIR:-/tmp}"
log="${ZG_INDEX_LOG:-${tmp_dir%/}/zg-index-$(basename "$root")-$(date +%Y%m%d-%H%M%S).log}"
retries="${ZG_INDEX_RETRIES:-1}"
ignore_file="$root/.zgignore"

# A source file with a stray NUL byte breaks tokenization. Binaries also hold
# NULs but zg skips them, so flag only files that are valid UTF-8 without the
# NULs and where NULs are rare.
flag_nul_files() {
  local found rg_args=(--files)
  [[ -f "$ignore_file" ]] && rg_args+=(--ignore-file "$ignore_file")
  found="$(cd "$root" && zg --rg "${rg_args[@]}" 2>/dev/null \
    | perl -ne '
        chomp; my $f = $_; next unless -f $f;
        my $size = -s _; next if $size == 0 || $size > 64 * 1024 * 1024;
        open(my $fh, "<:raw", $f) or next; local $/; my $data = <$fh>; close $fh;
        my $nul = ($data =~ tr/\0//); next unless $nul;
        (my $text = $data) =~ tr/\0//d; next unless utf8::decode($text);
        print "$f\n" if $nul <= 16 || $nul * 100 < $size;
      ')" || true
  [[ -z "$found" ]] && return 0

  printf 'index-guard: excluding files with NUL bytes (tokenizer cannot read them):\n' >&2
  local entries="" f
  while IFS= read -r f; do
    printf '    %s\n' "$f" >&2
    grep -qxF "/$f" "$ignore_file" 2>/dev/null || entries+="/$f"$'\n'
  done <<<"$found"
  [[ -n "$entries" ]] || return 0

  local header=""
  [[ -s "$ignore_file" ]] && header=$'\n'
  header+="# NUL bytes, added by index-guard on $(date +%F)"$'\n'
  printf '%s%s' "$header" "$entries" >>"$ignore_file"
}

zg_pid=""
stop_build() {
  [[ -n "$zg_pid" ]] || return 0
  pkill -TERM -P "$zg_pid" 2>/dev/null || true
  kill -TERM "$zg_pid" 2>/dev/null || true
  wait "$zg_pid" 2>/dev/null || true
  # The indexer child can outlive its wrapper and keep the workspace lock.
  pkill -TERM -f "zg.exe --index $root( |$)" 2>/dev/null || true
  zg_pid=""
}
trap 'stop_build' EXIT
trap 'stop_build; exit 130' INT TERM

last_files() {
  tr '\r' '\n' <"$log" | grep -E '^Indexing: ' | tail -3 | sed 's/^/    /' >&2
}

run_once() {
  local args=(--index "$root" --mode direct --device metal --color never)
  [[ -f "$ignore_file" ]] && args+=(--ignore-file .zgignore)
  ( cd "$root" && exec zg "${args[@]}" "$@" ) >>"$log" 2>&1 &
  zg_pid=$!

  while kill -0 "$zg_pid" 2>/dev/null; do
    if grep -q 'falling back to CPU' "$log"; then
      local cause
      cause="$(tr '\r' '\n' <"$log" | grep -m1 'falling back to CPU')"
      stop_build
      printf 'index-guard: stopped, zg fell back to the CPU:\n    %s\nlast files before it:\n' "$cause" >&2
      last_files
      if grep -qiE 'tokeni|nul byte' <<<"$cause"; then
        return 4
      fi
      return 3
    fi
    sleep 2
  done

  local rc=0
  wait "$zg_pid" || rc=$?
  zg_pid=""
  return "$rc"
}

flag_nul_files
printf 'index-guard: building %s, log: %s\n' "$root" "$log" >&2

attempt=0
while :; do
  rc=0
  run_once "$@" || rc=$?
  case "$rc" in
    0)
      tr '\r' '\n' <"$log" | grep -E '^files\b' | tail -1 >&2 || true
      exit 0 ;;
    4)
      printf 'index-guard: an input file broke tokenization; exclude it in %s and run again\n' "$ignore_file" >&2
      exit 3 ;;
    3)
      if (( attempt < retries )); then
        attempt=$((attempt + 1))
        printf 'index-guard: restarting from scratch (%d/%d)\n' "$attempt" "$retries" >&2
        continue
      fi
      exit 3 ;;
    *)
      printf 'index-guard: zg exited with %d, see %s\n' "$rc" "$log" >&2
      exit "$rc" ;;
  esac
done
