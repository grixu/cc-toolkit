#!/bin/bash
# Replace secrets in a transcript with ***. Exit 0 only when <out> is written; any other exit drops the entry.
# Usage: mask.sh <in> <out>
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: mask.sh <in> <out>" >&2
  exit 2
fi
IN=$1
OUT=$2
if [ ! -f "$IN" ] || [ ! -r "$IN" ]; then
  echo "mask.sh: cannot read $IN" >&2
  exit 1
fi

# BSD sed has no case-insensitive flag, so each keyword becomes bracket classes: token -> [tT][oO][kK][eE][nN].
ci() {
  local word=$1 out='' c i
  for ((i = 0; i < ${#word}; i++)); do
    c=${word:i:1}
    case $c in
      [a-z]) out+="[$c$(printf '%s' "$c" | tr '[:lower:]' '[:upper:]')]" ;;
      *) out+=$c ;;
    esac
  done
  printf '%s' "$out"
}

KW="($(ci token)|$(ci secret)|$(ci password)|$(ci passwd)|$(ci api)[_-]?$(ci key)|$(ci authorization)|$(ci cookie))"
NAME="([A-Za-z0-9_.-]*${KW}[A-Za-z0-9_.-]*)"
# A token must not continue an identifier, or "mask-runner-config-loader" would match sk-.
B='(^|[^A-Za-z0-9_-])'
DQ='"([^"\\]|\\.)*"'
PEM_BEGIN='-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----'
PEM_END='-----END [A-Z0-9 ]*PRIVATE KEY-----'
# A block opens only on a BEGIN line with no END after it; otherwise a one-line key would mask the rest of the file.
PEM_OPEN="${PEM_BEGIN}([^-]|-{1,4}[^-])*-{0,4}\$"

# LC_ALL=C: BSD sed rejects bytes that are invalid in the current locale, and C keeps the ranges ASCII.
export LC_ALL=C

TMP=$(mktemp "${OUT}.XXXXXX")
trap 'rm -f "$TMP"' EXIT

sed -E \
  -e "s/(${PEM_BEGIN}).*(${PEM_END})/\\1***\\2/g" \
  -e "/${PEM_OPEN}/,/${PEM_END}/{" \
  -e "/${PEM_BEGIN}|${PEM_END}/!s/.*/***/" \
  -e "}" \
  -e "s|([A-Za-z][A-Za-z0-9+.-]*://)[^/[:space:]@\"']+@|\\1***@|g" \
  -e "s/${B}xox[abp]-[A-Za-z0-9-]+/\\1***/g" \
  -e "s/${B}AIza[0-9A-Za-z_-]{35}/\\1***/g" \
  -e "s/${B}(--$(ci password))[[:space:]]+${DQ}/\\1\\2 \"***\"/g" \
  -e "s/${B}(--$(ci password))[[:space:]]+'[^']*'/\\1\\2 '***'/g" \
  -e "s/${B}(--$(ci password))[[:space:]]+[^\"'[:space:]][^[:space:]]*/\\1\\2 ***/g" \
  -e "s/($(ci bearer))[[:space:]]+[^[:space:]\"',;]+/\\1 ***/g" \
  -e "s/${B}gh[pousr]_[A-Za-z0-9]+/\\1***/g" \
  -e "s/${B}github_pat_[A-Za-z0-9_]+/\\1***/g" \
  -e "s/${B}sk-[A-Za-z0-9_-]{16,}/\\1***/g" \
  -e "s/${B}AKIA[0-9A-Z]{16}/\\1***/g" \
  -e "s/${B}eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]*/\\1***/g" \
  -e "s/(\"[^\"]*${KW}[^\"]*\"[[:space:]]*:[[:space:]]*)${DQ}/\\1\"***\"/g" \
  -e "s/(\"[^\"]*${KW}[^\"]*\"[[:space:]]*:[[:space:]]*)[^\"[:space:],}][^,}[:space:]]*/\\1***/g" \
  -e "s/(${NAME}[[:space:]]*=[[:space:]]*)${DQ}/\\1\"***\"/g" \
  -e "s/(${NAME}[[:space:]]*=[[:space:]]*)'[^']*'/\\1'***'/g" \
  -e "s/(${NAME}[[:space:]]*=[[:space:]]*)[^\"'[:space:]&;,][^[:space:]&;,]*/\\1***/g" \
  -e "s/(${NAME}[[:space:]]*:)[[:space:]]*[^[:space:]].*$/\\1 ***/" \
  "$IN" >"$TMP"

mv "$TMP" "$OUT"
trap - EXIT
