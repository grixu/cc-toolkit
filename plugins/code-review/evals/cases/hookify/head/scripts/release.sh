#!/usr/bin/env bash
set -euo pipefail
git tag "v$1"
git push --force origin "v$1"
