#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────
# sync-hookify.sh — Sync hookify plugin from upstream anthropics/claude-plugins-official
#
# Usage:
#   ./scripts/sync-hookify.sh [--ci]
#
# What it does:
#   1. Sparse-clones upstream (shallow, only plugins/hookify)
#   2. Updates the hookify-upstream branch with latest upstream files
#   3. Prints machine-parseable status for CI integration
#
# Flags:
#   --ci   Output GitHub Actions variables to $GITHUB_OUTPUT
#
# Requirements: git
# ──────────────────────────────────────────────────────────────

UPSTREAM_REPO="https://github.com/anthropics/claude-plugins-official.git"
UPSTREAM_PREFIX="plugins/hookify"
LOCAL_PREFIX="plugins/hookify"
SYNC_BRANCH="hookify-upstream"

REPO_ROOT="$(git rev-parse --show-toplevel)"
CURRENT_BRANCH="$(git symbolic-ref --short HEAD)"
CI_MODE=false
TEMP_DIR=""

# ── Helpers ──────────────────────────────────────────────────

die()  { echo "error: $*" >&2; exit 1; }
info() { echo "-> $*"; }

cleanup() {
  [[ -n "$TEMP_DIR" ]] && rm -rf "$TEMP_DIR"
  # Always try to return to original branch
  if [[ "$(git symbolic-ref --short HEAD 2>/dev/null)" != "$CURRENT_BRANCH" ]]; then
    git checkout "$CURRENT_BRANCH" --quiet 2>/dev/null || true
  fi
}
trap cleanup EXIT

output_status() {
  local status="$1" sha="$2"
  echo "SYNC_STATUS=$status"
  echo "UPSTREAM_SHA=$sha"
  if [[ "$CI_MODE" == true ]] && [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    echo "sync_status=$status" >> "$GITHUB_OUTPUT"
    echo "upstream_sha=$sha" >> "$GITHUB_OUTPUT"
  fi
}

# ── Argument parsing ─────────────────────────────────────────

for arg in "$@"; do
  case "$arg" in
    --ci) CI_MODE=true ;;
    *)    die "unknown argument: $arg" ;;
  esac
done

# ── Validations ──────────────────────────────────────────────

if ! git diff --quiet || ! git diff --cached --quiet; then
  die "working tree has uncommitted changes. Commit or stash first."
fi

# ── Fetch upstream (sparse, shallow) ─────────────────────────

info "Fetching upstream hookify from anthropics/claude-plugins-official..."
TEMP_DIR=$(mktemp -d)

git clone --depth=1 --filter=blob:none --sparse \
  "$UPSTREAM_REPO" "$TEMP_DIR/upstream" --quiet

(cd "$TEMP_DIR/upstream" && git sparse-checkout set "$UPSTREAM_PREFIX")

UPSTREAM_SHA=$(cd "$TEMP_DIR/upstream" && git rev-parse --short HEAD)

# Verify upstream directory exists
if [[ ! -d "$TEMP_DIR/upstream/$UPSTREAM_PREFIX" ]]; then
  die "upstream $UPSTREAM_PREFIX not found. Has the directory been moved or renamed?"
fi

info "Upstream commit: $UPSTREAM_SHA"

# ── Switch to sync branch ───────────────────────────────────

cd "$REPO_ROOT"

if git show-ref --verify --quiet "refs/heads/$SYNC_BRANCH"; then
  info "Switching to existing branch '$SYNC_BRANCH'"
  git checkout "$SYNC_BRANCH" --quiet
else
  info "Creating orphan branch '$SYNC_BRANCH'"
  git checkout --orphan "$SYNC_BRANCH" --quiet
  git rm -rf . --quiet 2>/dev/null || true
fi

# ── Sync files ───────────────────────────────────────────────

# Remove existing hookify files on the branch (clean slate for upstream)
if [[ -d "$LOCAL_PREFIX" ]]; then
  rm -rf "$LOCAL_PREFIX"
fi

# Copy upstream files
mkdir -p "$LOCAL_PREFIX"
cp -R "$TEMP_DIR/upstream/$UPSTREAM_PREFIX/"* "$LOCAL_PREFIX/"
# Copy hidden files too (like .gitignore)
cp -R "$TEMP_DIR/upstream/$UPSTREAM_PREFIX/".* "$LOCAL_PREFIX/" 2>/dev/null || true

# ── Detect changes ───────────────────────────────────────────

git add "$LOCAL_PREFIX/"

if git diff --cached --quiet 2>/dev/null; then
  # Also check for untracked files (first run on orphan branch)
  UNTRACKED=$(git ls-files --others --exclude-standard "$LOCAL_PREFIX/" 2>/dev/null | head -1)
  if [[ -z "$UNTRACKED" ]]; then
    info "No upstream changes detected."
    output_status "no-changes" "$UPSTREAM_SHA"
    git checkout "$CURRENT_BRANCH" --quiet
    exit 0
  fi
  git add "$LOCAL_PREFIX/"
fi

# ── Commit ───────────────────────────────────────────────────

info "Committing upstream changes..."
git commit -m "$(cat <<EOF
sync: hookify upstream @ $UPSTREAM_SHA

Source: anthropics/claude-plugins-official@$UPSTREAM_SHA
Path: $UPSTREAM_PREFIX
EOF
)" --quiet

# ── Done ─────────────────────────────────────────────────────

git checkout "$CURRENT_BRANCH" --quiet

info "Upstream changes synced to branch '$SYNC_BRANCH'"
info ""
info "Next steps:"
info "  git merge $SYNC_BRANCH --allow-unrelated-histories  # first time"
info "  git merge $SYNC_BRANCH                              # subsequent"
echo

output_status "updated" "$UPSTREAM_SHA"
