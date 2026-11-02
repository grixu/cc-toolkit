#!/bin/bash
# Deletes paths inside a walkthrough work dir.
# Usage: clean.sh <work dir> <relative path>...   e.g. clean.sh ~/.cache/walkthrough-video/repo/slug recast/.state recast/test-results
# An rm with a variable or glob in its path stops the run for approval even in bypassPermissions mode,
# because Claude Code cannot rule out a critical path; inside this script the check never sees it.
set -euo pipefail
ROOT=$HOME/.cache/walkthrough-video
WORK=$(cd "$1" && pwd -P)
shift
case $WORK/ in
  "$(cd "$ROOT" && pwd -P)"/*/*/) ;;
  *) echo "refusing: $WORK is not a work dir under $ROOT/<repo>/<slug>" >&2; exit 1 ;;
esac
for rel in "$@"; do
  case /$rel/ in
    //|/../*|*/../*|/./*) echo "refusing: '$rel' must be a relative path inside the work dir" >&2; exit 1 ;;
  esac
  [ "${rel#/}" = "$rel" ] || { echo "refusing: '$rel' is absolute" >&2; exit 1; }
  rm -rf -- "${WORK:?}/$rel"
  echo "deleted $rel"
done
