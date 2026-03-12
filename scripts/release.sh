#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────
# release.sh — Release a single plugin from the cc-toolkit monorepo
#
# Usage:
#   ./scripts/release.sh <plugin-name> <patch|minor|major>
#
# What it does:
#   1. Validates the plugin exists and CHANGELOG has an [Unreleased] section
#   2. Bumps the version in plugin.json and marketplace.json
#   3. Stamps [Unreleased] in CHANGELOG.md with version + date
#   4. Commits, tags (plugin-name/vX.Y.Z), and optionally pushes + creates GH release
#
# Requirements: jq, git, gh (optional, for GitHub release)
#
# Edge cases / limitations:
#   - Does not handle inter-plugin dependencies (none exist today)
#   - Assumes marketplace.json has a single entry per plugin name
#   - CHANGELOG must have an [Unreleased] section with content to release
#   - Does not support pre-release versions (e.g. 1.0.0-beta.1)
# ──────────────────────────────────────────────────────────────

REPO_ROOT="$(git rev-parse --show-toplevel)"
MARKETPLACE="$REPO_ROOT/.claude-plugin/marketplace.json"

# ── Helpers ──────────────────────────────────────────────────

die()  { echo "error: $*" >&2; exit 1; }
info() { echo "→ $*"; }

usage() {
  cat <<EOF
Usage: $(basename "$0") <plugin-name> <patch|minor|major>

Arguments:
  plugin-name   Name of the plugin directory under plugins/
  patch|minor|major   Semantic version bump type

Example:
  $(basename "$0") codex-plan-improver minor
EOF
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

bump_version() {
  local version="$1" part="$2"
  local major minor patch
  IFS='.' read -r major minor patch <<< "$version"

  case "$part" in
    major) echo "$((major + 1)).0.0" ;;
    minor) echo "$major.$((minor + 1)).0" ;;
    patch) echo "$major.$minor.$((patch + 1))" ;;
    *)     die "invalid bump type: $part (expected patch|minor|major)" ;;
  esac
}

# ── Argument parsing ─────────────────────────────────────────

[[ $# -eq 2 ]] || usage

PLUGIN_NAME="$1"
BUMP_TYPE="$2"

PLUGIN_DIR="$REPO_ROOT/plugins/$PLUGIN_NAME"
PLUGIN_JSON="$PLUGIN_DIR/.claude-plugin/plugin.json"
CHANGELOG="$PLUGIN_DIR/CHANGELOG.md"

# ── Validations ──────────────────────────────────────────────

require_cmd jq
require_cmd git

[[ -d "$PLUGIN_DIR" ]]  || die "plugin directory not found: $PLUGIN_DIR"
[[ -f "$PLUGIN_JSON" ]] || die "plugin.json not found: $PLUGIN_JSON"
[[ -f "$CHANGELOG" ]]   || die "CHANGELOG.md not found: $CHANGELOG"
[[ -f "$MARKETPLACE" ]] || die "marketplace.json not found: $MARKETPLACE"

# Check for clean working tree (only for the plugin being released)
if ! git diff --quiet -- "$PLUGIN_DIR" "$MARKETPLACE"; then
  die "working tree has uncommitted changes in plugin or marketplace files. Commit or stash first."
fi

# Check that CHANGELOG has [Unreleased] section with content
if ! grep -q '## \[Unreleased\]' "$CHANGELOG"; then
  die "CHANGELOG.md has no [Unreleased] section. Add your changes there before releasing."
fi

UNRELEASED_CONTENT=$(sed -n '/^## \[Unreleased\]/,/^## \[/{ /^## \[/d; p; }' "$CHANGELOG" | sed '/^$/d')
if [[ -z "$UNRELEASED_CONTENT" ]]; then
  die "CHANGELOG.md [Unreleased] section is empty. Add your changes before releasing."
fi

# ── Version calculation ──────────────────────────────────────

CURRENT_VERSION=$(jq -r '.version' "$PLUGIN_JSON")
NEW_VERSION=$(bump_version "$CURRENT_VERSION" "$BUMP_TYPE")
TAG_NAME="$PLUGIN_NAME/v$NEW_VERSION"
TODAY=$(date +%Y-%m-%d)

info "Plugin:  $PLUGIN_NAME"
info "Version: $CURRENT_VERSION → $NEW_VERSION"
info "Tag:     $TAG_NAME"
info "Date:    $TODAY"
echo

# Check tag doesn't already exist
if git rev-parse "$TAG_NAME" >/dev/null 2>&1; then
  die "tag $TAG_NAME already exists"
fi

# ── Confirm ──────────────────────────────────────────────────

read -rp "Proceed with release? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
echo

# ── Update files ─────────────────────────────────────────────

# 1. Bump version in plugin.json
info "Updating plugin.json"
jq --arg v "$NEW_VERSION" '.version = $v' "$PLUGIN_JSON" > "$PLUGIN_JSON.tmp"
mv "$PLUGIN_JSON.tmp" "$PLUGIN_JSON"

# 2. Bump version in marketplace.json
info "Updating marketplace.json"
jq --arg name "$PLUGIN_NAME" --arg v "$NEW_VERSION" \
  '(.plugins[] | select(.name == $name)).version = $v' \
  "$MARKETPLACE" > "$MARKETPLACE.tmp"
mv "$MARKETPLACE.tmp" "$MARKETPLACE"

# 3. Stamp CHANGELOG — replace [Unreleased] header with version + date, add fresh [Unreleased]
info "Updating CHANGELOG.md"
sed -i '' "s/^## \[Unreleased\]/## [$NEW_VERSION] - $TODAY/" "$CHANGELOG"

# Insert fresh [Unreleased] section after the header block
sed -i '' "/^and this project adheres to/a\\
\\
## [Unreleased]" "$CHANGELOG"

# ── Git commit & tag ─────────────────────────────────────────

info "Creating commit"
git add "$PLUGIN_JSON" "$MARKETPLACE" "$CHANGELOG"
git commit -m "$(cat <<EOF
release: $PLUGIN_NAME v$NEW_VERSION

Bump $PLUGIN_NAME from $CURRENT_VERSION to $NEW_VERSION.
EOF
)"

info "Creating tag: $TAG_NAME"
git tag -a "$TAG_NAME" -m "$PLUGIN_NAME v$NEW_VERSION"

# ── Optional: push & GitHub release ─────────────────────────

echo
read -rp "Push to remote and create GitHub Release? [y/N] " push_confirm
if [[ "$push_confirm" =~ ^[Yy]$ ]]; then
  info "Pushing commits and tag"
  git push
  git push origin "$TAG_NAME"

  if command -v gh >/dev/null 2>&1; then
    info "Creating GitHub Release"

    # Extract release notes from CHANGELOG for this version
    RELEASE_NOTES=$(sed -n "/^## \[$NEW_VERSION\]/,/^## \[/{/^## \[$NEW_VERSION\]/d;/^## \[/d;p;}" "$CHANGELOG" | sed '1{/^$/d}')

    gh release create "$TAG_NAME" \
      --title "$PLUGIN_NAME v$NEW_VERSION" \
      --notes "$RELEASE_NOTES"

    info "Done! Release created."
  else
    info "gh CLI not found — skipping GitHub Release (create manually if needed)"
  fi
else
  echo
  info "Done! Commit and tag created locally."
  info "When ready, run:"
  echo "  git push && git push origin $TAG_NAME"
fi
