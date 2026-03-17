#!/usr/bin/env bash
#
# Compute the deterministic storage root path for feature-delivery plugin.
#
# Usage:
#   storage-root.sh              — print the storage root path
#   storage-root.sh --ensure     — print and create the directory if it doesn't exist
#
# Output: absolute path to $HOME/.claude/grixu-cc-toolkit/feature-delivery/<project-slug>
#
# The project slug is derived from the basename of the current working directory:
#   1. Lowercase
#   2. Replace non-alphanumeric characters (except hyphens) with hyphens
#   3. Collapse consecutive hyphens
#   4. Trim leading/trailing hyphens

set -euo pipefail

slug="$(basename "$PWD" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g; s/--*/-/g; s/^-//; s/-$//')"

storage_root="$HOME/.claude/grixu-cc-toolkit/feature-delivery/$slug"

if [[ "${1:-}" == "--ensure" ]]; then
  mkdir -p "$storage_root"
fi

echo "$storage_root"
