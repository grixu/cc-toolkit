#!/usr/bin/env bash
# Rebuild the transcript_audio bundles.
# Run before releasing a new version of the yt plugin when transcribe.mjs,
# transliterate.mjs, or any @elevenlabs/elevenlabs-js bump has changed.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
PLUGIN_DIR="$(cd -- "${SCRIPT_DIR}/.." &>/dev/null && pwd)"
TOOLS_DIR="${PLUGIN_DIR}/tools/transcript_audio"
OUT_DIR="${PLUGIN_DIR}/scripts/transcript_audio"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "error: pnpm not found in PATH" >&2
  exit 1
fi

cd "${TOOLS_DIR}"

if [[ ! -d node_modules ]]; then
  echo "Installing build dependencies..."
  pnpm install --frozen-lockfile=false
fi

echo "Building bundles..."
pnpm build

for expected in transcribe.mjs transliterate.mjs; do
  if [[ ! -f "${OUT_DIR}/${expected}" ]]; then
    echo "error: expected bundle missing: ${OUT_DIR}/${expected}" >&2
    exit 1
  fi
  if [[ ! -x "${OUT_DIR}/${expected}" ]]; then
    echo "error: bundle not executable: ${OUT_DIR}/${expected}" >&2
    exit 1
  fi
done

echo "OK: bundles rebuilt at ${OUT_DIR#"${PLUGIN_DIR}/"}/"
ls -la "${OUT_DIR}"
