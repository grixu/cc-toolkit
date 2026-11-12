#!/usr/bin/env bash
set -euo pipefail
bash "$(dirname "${BASH_SOURCE[0]}")/../fixture-repo.sh"
echo ".scratch/" >> .git/info/exclude
