#!/usr/bin/env bash
# Runs a command with the R2 keys exported from the git-ignored key file at the main checkout's root, which
# scripts/r2-secrets-init.sh writes. Keys already in the environment (CI) keep their values.
#
#   bash scripts/with-r2-keys.sh <command> [args…]
set -euo pipefail

vars=(R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET)
saved=()
missing=()
for v in "${vars[@]}"; do
  if [[ -n "${!v:-}" ]]; then saved+=("$v=${!v}"); else missing+=("$v"); fi
done

common_dir="$(git -C "$(dirname "$0")" rev-parse --path-format=absolute --git-common-dir)"
keys="$(dirname "$common_dir")/.r2-secrets.sh"

# Without the file the command still runs: a pull whose pinned data is already in place needs no keys, and the
# script itself names the generator when it does.
if ((${#missing[@]})) && [[ -f "$keys" ]]; then
  # shellcheck source=/dev/null
  source "$keys"
  for kv in ${saved[@]+"${saved[@]}"}; do export "${kv?}"; done
  missing=()
  for v in "${vars[@]}"; do [[ -n "${!v:-}" ]] || missing+=("$v"); done
  if ((${#missing[@]})); then
    echo "$keys lacks ${missing[*]}; rewrite it with: bash scripts/r2-secrets-init.sh --force" >&2
    exit 1
  fi
fi

exec "$@"
