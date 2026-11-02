#!/bin/bash
# Runs Playwright from the pnpm dlx install; NODE_PATH lets the scratch config and tests resolve its packages.
# Usage: TAKE=take1 ./pw.sh --project=walkthrough   (RECAST_FAST=1 for a quick dry run)
# RECAST_VERSION / PLAYWRIGHT_VERSION: the pair recast-notes.md names.
set -euo pipefail
RECAST_VERSION=${RECAST_VERSION:-0.23.0}
PLAYWRIGHT_VERSION=${PLAYWRIGHT_VERSION:-1.63.0}
export npm_config_pm_on_fail=ignore pnpm_config_pm_on_fail=ignore
cd "$(dirname "$0")"
# ${1+"$@"}: macOS bash 3.2 treats a bare "$@" with no arguments as unbound under set -u.
# shellcheck disable=SC2016 # expands in the inner bash, where the dlx install puts playwright on PATH
exec pnpm dlx --package "playwright-recast@$RECAST_VERSION" --package "@playwright/test@$PLAYWRIGHT_VERSION" \
  bash -c 'NODE_PATH="$(dirname "$(command -v playwright)")/.." exec playwright test -c playwright.config.ts "$@"' pw ${1+"$@"}
