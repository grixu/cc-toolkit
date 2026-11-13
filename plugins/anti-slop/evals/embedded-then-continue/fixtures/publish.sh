#!/usr/bin/env bash
set -euo pipefail
mkdir -p .published
cp "$1" .published/body.md
echo "published $(wc -l < "$1") lines"
