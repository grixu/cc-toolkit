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

for s in pr-clear-private pr-transitive-rerun; do
  pr="cases/$s/pr.json"
  n="$(jq -r .number "$pr")"
  repo=".sandbox/$s"
  origin="$(pwd)/.sandbox/$s-origin.git"
  checkout "$repo" "cases/$s/base"
  git clone -q --bare "$repo" "$origin"
  git -C "$repo" remote add origin "$origin"
  git -C "$repo" fetch -q origin
  git -C "$repo" branch -q --set-upstream-to=origin/main main
  git -C "$repo" switch -q -c pr-head
  cp -R "cases/$s/head/." "$repo/"
  git -C "$repo" add -A
  commit "$repo" "$(jq -r .title "$pr")"
  git -C "$repo" push -q origin "HEAD:refs/pull/$n/head" "HEAD:refs/heads/$(jq -r .headRefName "$pr")"
  git -C "$repo" switch -q main
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

# The cooldown scenario needs a version published under 7 days ago, which no pinned version stays
# for longer than a week, so it takes the newest release of a frequently released package.
cool=.sandbox/blocked-cooldown
mkdir -p "$cool"
picked=''
for pkg in @biomejs/biome vite next @aws-sdk/client-s3 renovate; do
  times="$(npm view "$pkg" time --json 2>/dev/null)" || continue
  target="$(npm view "$pkg" dist-tags.latest 2>/dev/null)" || continue
  published="$(jq -r --arg v "$target" '.[$v]' <<<"$times")"
  # 6 days, not 7, so the version is still in cooldown when the run ends.
  fresh="$(jq -r --arg v "$target" '(.[$v][:19] + "Z" | fromdateiso8601) > (now - 6 * 86400)' <<<"$times")"
  [ "$fresh" = true ] || continue
  vulns="$(curl -s -d "{\"version\":\"$target\",\"package\":{\"name\":\"$pkg\",\"ecosystem\":\"npm\"}}" https://api.osv.dev/v1/query | jq '.vulns | length')"
  [ "$vulns" = 0 ] || continue
  current="$(jq -r 'to_entries
    | map(select(.key | test("^[0-9]+\\.[0-9]+\\.[0-9]+$")) | .t = (.value[:19] + "Z" | fromdateiso8601))
    | map(select(.t <= now - 30 * 86400)) | max_by(.t) | .key' <<<"$times")"
  integrity="$(npm view "$pkg@$current" dist.integrity)"
  picked="$pkg"
  break
done

if [ -z "$picked" ]; then
  echo '{"unavailable":"no candidate package has a release under 6 days old without advisories"}' > .sandbox/blocked-cooldown.json
  printf 'none@0.0.0' > .sandbox/blocked-cooldown-input.txt
  echo "reset-sandbox: blocked-cooldown has no fresh candidate; its check will fail as a fixture problem" >&2
  exit 0
fi

jq -n --arg pkg "$picked" --arg current "$current" --arg target "$target" --arg published "$published" \
  '{package: $pkg, current: $current, target: $target, published: $published}' > .sandbox/blocked-cooldown.json
printf '%s@%s' "$picked" "$target" > .sandbox/blocked-cooldown-input.txt
jq -n --arg pkg "$picked" --arg current "$current" \
  '{name: "web-tooling", version: "1.0.0", private: true, packageManager: "pnpm@11.26.0",
    devDependencies: {($pkg): "^\($current)"}}' > "$cool/package.json"
cat > "$cool/pnpm-lock.yaml" <<EOF
lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

importers:

  .:
    devDependencies:
      '$picked':
        specifier: ^$current
        version: $current

packages:

  '$picked@$current':
    resolution: {integrity: $integrity}

snapshots:

  '$picked@$current': {}
EOF
git -C "$cool" init -q -b main
git -C "$cool" add -A
commit "$cool" 'chore: initial commit'
