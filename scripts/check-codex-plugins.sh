#!/usr/bin/env bash
set -uo pipefail

# ──────────────────────────────────────────────────────────────
# check-codex-plugins.sh — Static checks for every plugin that ships a
# .codex-plugin/plugin.json
#
# Usage:
#   ./scripts/check-codex-plugins.sh
#
# Checks:
#   - the Codex manifest parses and its shared fields equal the Claude manifest's
#   - its skills root exists, and every adapter's frontmatter name matches its dir
#   - an adapter is explicit-only exactly when its canonical body is a command or a
#     user-invocable: false skill
#   - every <root>/… path an adapter names exists
#   - no adapter relies on ${CLAUDE_PLUGIN_ROOT}, which Codex never substitutes
#
# Requirements: jq
# ──────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fail=0

bad() {
  echo "FAIL  $1"
  fail=1
}

frontmatter() {
  awk 'NR == 1 && /^---$/ { open = 1; next } open && /^---$/ { exit } open' "$1"
}

for codex_manifest in "$REPO_ROOT"/plugins/*/.codex-plugin/plugin.json; do
  [[ -e "$codex_manifest" ]] || continue
  plugin_dir="$(dirname "$(dirname "$codex_manifest")")"
  plugin="$(basename "$plugin_dir")"
  claude_manifest="$plugin_dir/.claude-plugin/plugin.json"

  if ! jq -e . "$codex_manifest" >/dev/null 2>&1; then
    bad "$plugin: .codex-plugin/plugin.json is not valid JSON"
    continue
  fi
  for field in name version description author repository keywords; do
    if [[ "$(jq -cS ".$field" "$codex_manifest")" != "$(jq -cS ".$field" "$claude_manifest")" ]]; then
      bad "$plugin: .codex-plugin/plugin.json .$field differs from .claude-plugin/plugin.json"
    fi
  done

  skills_root="$(jq -r '.skills // empty' "$codex_manifest")"
  if [[ -z "$skills_root" || ! -d "$plugin_dir/${skills_root#./}" ]]; then
    bad "$plugin: skills root '${skills_root}' does not exist"
    continue
  fi

  for skill_dir in "$plugin_dir/${skills_root#./}"*/; do
    skill="$(basename "$skill_dir")"
    skill_md="$skill_dir/SKILL.md"
    if [[ ! -f "$skill_md" ]]; then
      bad "$plugin/$skill: no SKILL.md"
      continue
    fi

    name="$(frontmatter "$skill_md" | awk -F': *' '$1 == "name" { print $2 }')"
    [[ "$name" == "$skill" ]] || bad "$plugin/$skill: frontmatter name '$name' does not match its directory"
    frontmatter "$skill_md" | grep -q '^description:' || bad "$plugin/$skill: frontmatter has no description"

    explicit_expected=false
    if [[ -f "$plugin_dir/commands/$skill.md" ]] \
      || frontmatter "$plugin_dir/skills/$skill/SKILL.md" 2>/dev/null | grep -q '^user-invocable: false'; then
      explicit_expected=true
    fi
    explicit_actual=false
    grep -q 'allow_implicit_invocation: false' "$skill_dir/agents/openai.yaml" 2>/dev/null && explicit_actual=true
    [[ "$explicit_expected" == "$explicit_actual" ]] \
      || bad "$plugin/$skill: explicit-only is $explicit_actual, its canonical body implies $explicit_expected"

    while read -r ref; do
      rel="${ref#<root>/}"
      [[ -e "$plugin_dir/${rel%.}" ]] || bad "$plugin/$skill: names $ref, which does not exist"
    done < <(grep -o '<root>/[A-Za-z0-9_./-]*' "$skill_md" | sort -u)

    if grep -q 'CLAUDE_PLUGIN_ROOT' "$skill_md"; then
      bad "$plugin/$skill: uses \${CLAUDE_PLUGIN_ROOT}, which Codex leaves unexpanded"
    fi
  done
done

[[ "$fail" -eq 0 ]] && echo "OK — Codex plugins consistent"
exit "$fail"
