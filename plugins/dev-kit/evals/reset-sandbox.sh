#!/usr/bin/env bash
# Rebuild .sandbox/: one git checkout per scenario from cases/, a bare origin holding each PR head
# under refs/pull/<n>/head, and the gh stand-in. scripts/run-evals.sh runs this before every trial.
set -euo pipefail
cd "$(dirname "$0")"

rm -rf .sandbox
mkdir -p .sandbox/bin .sandbox/prs
cp gh-stand-in.sh .sandbox/bin/gh
chmod +x .sandbox/bin/gh

commit() { git -C "$1" -c user.name='dev-kit-evals' -c user.email='dev-kit-evals@localhost' commit -q -m "$2" --no-gpg-sign; }

checkout() {
  mkdir -p "$1"
  cp -R "$2/." "$1/"
  git -C "$1" init -q -b main
  git -C "$1" add -A
  commit "$1" 'chore: initial commit'
}

for s in escalated-direct blocked-malware; do
  checkout ".sandbox/$s" "cases/$s"
done

# A case may borrow another case's base/ and head/ (its `fixtures` file names it) and may leave the
# checkout on the PR's merge commit, as actions/checkout does on a pull_request run (`checkout`: merge).
for s in pr-clear-private pr-transitive-rerun pr-escalated-accept pr-merge-checkout pr-upsert-installation-token \
  pr-unattended-escalated pr-unattended-carry pr-unattended-env; do
  pr="cases/$s/pr.json"
  n="$(jq -r .number "$pr")"
  src="cases/$s"
  [ -f "$src/fixtures" ] && src="cases/$(cat "$src/fixtures")"
  repo=".sandbox/$s"
  origin="$(pwd)/.sandbox/$s-origin.git"
  checkout "$repo" "$src/base"
  git clone -q --bare "$repo" "$origin"
  git -C "$repo" remote add origin "$origin"
  git -C "$repo" fetch -q origin
  git -C "$repo" branch -q --set-upstream-to=origin/main main
  git -C "$repo" switch -q -c pr-head
  cp -R "$src/head/." "$repo/"
  git -C "$repo" add -A
  commit "$repo" "$(jq -r .title "$pr")"
  git -C "$repo" push -q origin "HEAD:refs/pull/$n/head" "HEAD:refs/heads/$(jq -r .headRefName "$pr")"
  if [ "$(cat "cases/$s/checkout" 2>/dev/null)" = merge ]; then
    git -C "$repo" switch -q --detach main
    git -C "$repo" -c user.name='dev-kit-evals' -c user.email='dev-kit-evals@localhost' merge -q --no-ff --no-edit --no-gpg-sign pr-head
  else
    git -C "$repo" switch -q main
  fi
  git -C "$repo" branch -q -D pr-head
  mkdir -p ".sandbox/prs/$n"
  cp "$pr" ".sandbox/prs/$n/pr.json"
  printf '%s\n' "$origin" > ".sandbox/prs/$n/origin"
  if [ -f "cases/$s/comments.json" ]; then
    cp "cases/$s/comments.json" ".sandbox/prs/$n/comments.json"
  else
    echo '[]' > ".sandbox/prs/$n/comments.json"
  fi
done

# A one-package repository whose lockfile pins <pkg>@<current>, for the scenarios picked at reset time.
fresh_repo() {
  local dir="$1" field="$2" pkg="$3" current="$4" integrity
  integrity="$(npm view "$pkg@$current" dist.integrity)"
  mkdir -p "$dir"
  jq -n --arg field "$field" --arg pkg "$pkg" --arg current "$current" \
    '{name: "web-app", version: "1.0.0", private: true, packageManager: "pnpm@11.26.0",
      ($field): {($pkg): "^\($current)"}}' > "$dir/package.json"
  cat > "$dir/pnpm-lock.yaml" <<EOF
lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

importers:

  .:
    $field:
      '$pkg':
        specifier: ^$current
        version: $current

packages:

  '$pkg@$current':
    resolution: {integrity: $integrity}

snapshots:

  '$pkg@$current': {}
EOF
  git -C "$dir" init -q -b main
  git -C "$dir" add -A
  commit "$dir" 'chore: initial commit'
}

# 6 days, not 7, so a picked version is still in cooldown when the run ends.
fresh() { jq -r --arg v "$2" '((.[$v] // "1970-01-01T00:00:00")[:19] + "Z" | fromdateiso8601) > (now - 6 * 86400)' <<<"$1"; }
osv_count() { curl -s -d "{\"version\":\"$2\",\"package\":{\"name\":\"$1\",\"ecosystem\":\"npm\"}}" https://api.osv.dev/v1/query | jq '.vulns | length'; }
graph() {
  curl -sf "https://api.deps.dev/v3/systems/npm/packages/$(jq -rn --arg p "$1" '$p | @uri')/versions/$2:dependencies" |
    jq -r '.nodes[1:][] | "\(.versionKey.name)@\(.versionKey.version)"' | sort
}
unavailable() {
  jq -n --arg why "$2" '{unavailable: $why}' > ".sandbox/$1.json"
  printf 'none@0.0.0' > ".sandbox/$1-input.txt"
  echo "reset-sandbox: $1 has no candidate ($2); its check will fail as a fixture problem" >&2
}

# The cooldown scenario needs a version published under 7 days ago, which no pinned version stays
# for longer than a week, so it takes the newest release of a frequently released package.
picked=''
for pkg in @biomejs/biome vite next @aws-sdk/client-s3 renovate; do
  times="$(npm view "$pkg" time --json 2>/dev/null)" || continue
  target="$(npm view "$pkg" dist-tags.latest 2>/dev/null)" || continue
  [ "$(fresh "$times" "$target")" = true ] || continue
  [ "$(osv_count "$pkg" "$target")" = 0 ] || continue
  current="$(jq -r 'to_entries
    | map(select(.key | test("^[0-9]+\\.[0-9]+\\.[0-9]+$")) | .t = (.value[:19] + "Z" | fromdateiso8601))
    | map(select(.t <= now - 30 * 86400)) | max_by(.t) | .key' <<<"$times")"
  # A target that fixes an advisory of current is exempt from the cooldown, and the answer is clear.
  [ "$(osv_count "$pkg" "$current")" = 0 ] || continue
  published="$(jq -r --arg v "$target" '.[$v]' <<<"$times")"
  picked="$pkg"
  break
done

if [ -n "$picked" ]; then
  jq -n --arg pkg "$picked" --arg current "$current" --arg target "$target" --arg published "$published" \
    '{package: $pkg, current: $current, target: $target, published: $published}' > .sandbox/blocked-cooldown.json
  printf '%s@%s' "$picked" "$target" > .sandbox/blocked-cooldown-input.txt
  fresh_repo .sandbox/blocked-cooldown devDependencies "$picked" "$current"
else
  unavailable blocked-cooldown 'no candidate package has a release under 6 days old without advisories'
fi

# The exemption needs a release under 6 days old that patches a moderate-or-above advisory of the
# version before it, so it searches the newest npm advisories for one. The fix must be clean and keep
# the dependency graph, or an advisory or a fresh transitive version would decide the outcome instead.
recent=.results/recent-npm-advisories.json
mkdir -p .results
# Cached for 6 hours: the unauthenticated GitHub API allows 60 requests an hour, shared with the gh stand-in.
if [ -z "$(find "$recent" -mmin -360 2>/dev/null)" ]; then
  curl -sf 'https://api.github.com/advisories?ecosystem=npm&type=reviewed&per_page=100&sort=published&direction=desc' > "$recent.tmp" &&
    mv "$recent.tmp" "$recent"
fi
picked=''
if [ -s "$recent" ]; then
  while IFS=$'\t' read -r ghsa pkg range fix; do
    times="$(npm view "$pkg" time --json 2>/dev/null)" || continue
    [ "$(fresh "$times" "$fix")" = true ] || continue
    current="$(npm view "$pkg@${range//, / }" version --json 2>/dev/null | jq -r 'if type == "array" then .[-1] else . end')"
    [ -n "$current" ] && [ "$current" != null ] || continue
    [ "$(osv_count "$pkg" "$fix")" = 0 ] || continue
    [ "$(npm view "$pkg@$current" dependencies --json | jq -S -c .)" = "$(npm view "$pkg@$fix" dependencies --json | jq -S -c .)" ] || continue
    before="$(graph "$pkg" "$current")" || continue
    after="$(graph "$pkg" "$fix")" || continue
    [ -z "$(comm -13 <(printf '%s\n' "$before") <(printf '%s\n' "$after") | sed '/^$/d')" ] || continue
    published="$(jq -r --arg v "$fix" '.[$v]' <<<"$times")"
    picked="$pkg"
    break
  done < <(jq -r '.[] | select(.withdrawn_at == null and (.severity == "moderate" or .severity == "high" or .severity == "critical"))
    | .ghsa_id as $id | .vulnerabilities[]
    | select(.package.ecosystem == "npm" and .first_patched_version != null)
    | [$id, .package.name, .vulnerable_version_range, .first_patched_version] | @tsv' "$recent")
fi

if [ -n "$picked" ]; then
  jq -n --arg pkg "$picked" --arg current "$current" --arg target "$fix" --arg published "$published" --arg advisory "$ghsa" \
    '{package: $pkg, current: $current, target: $target, published: $published, advisory: $advisory}' > .sandbox/cooldown-exempt.json
  printf '%s@%s' "$picked" "$fix" > .sandbox/cooldown-exempt-input.txt
  fresh_repo .sandbox/cooldown-exempt dependencies "$picked" "$current"
else
  unavailable cooldown-exempt 'no recent npm advisory has a clean fix released under 6 days ago with an unchanged dependency graph'
fi
