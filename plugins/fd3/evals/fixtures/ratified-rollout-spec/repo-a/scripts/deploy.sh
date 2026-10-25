#!/usr/bin/env bash
set -euo pipefail
service="${1:?usage: deploy.sh <checkout|ledger>}"
echo "deploying ${service} at ${GITHUB_SHA:-local}"
