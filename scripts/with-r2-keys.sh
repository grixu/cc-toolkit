#!/usr/bin/env bash
# Runs a command with the R2 keys exported from the git-ignored key file at the main checkout's root, which
# scripts/r2-secrets-init.sh writes, unless the environment already sets them (CI).
#
#   bash scripts/with-r2-keys.sh <command> [args…]
set -euo pipefail

vars=(R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET)
missing=()
for v in "${vars[@]}"; do [[ -n "${!v:-}" ]] || missing+=("$v"); done

if ((${#missing[@]})); then
  common_dir="$(git -C "$(dirname "$0")" rev-parse --path-format=absolute --git-common-dir)"
  keys="$(dirname "$common_dir")/.r2-secrets.sh"
  if [[ ! -f "$keys" ]]; then
    echo "missing ${missing[*]} and no $keys; create it with: bash scripts/r2-secrets-init.sh" >&2
    exit 1
  fi
  # shellcheck source=/dev/null
  source "$keys"
fi

exec "$@"
