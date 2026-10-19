#!/usr/bin/env bash
# Rebuild the git checkout the headless-track eval reviews: a base commit, then one commit that adds
# two fixtures with planted findings. The headless skills review committed changes only, so the
# file-path fixtures the other tracks read cannot serve them. scripts/run-evals.sh runs this first.
set -euo pipefail
cd "$(dirname "$0")"

rm -rf .sandbox
repo=.sandbox/headless
mkdir -p "$repo/src"
git -C "$repo" init -q -b main
printf '# orders service\n' > "$repo/README.md"
git -C "$repo" add -A
git -C "$repo" -c user.name='cr-evals' -c user.email='cr-evals@localhost' commit -q -m 'base' --no-gpg-sign

# Under src/, not fixtures/: scope.md classes anything below a fixtures/ directory as test code.
cp fixtures/security-recall.ts "$repo/src/security-recall.ts"
cp fixtures/quality-recall.ts "$repo/src/quality-recall.ts"
git -C "$repo" add -A
git -C "$repo" -c user.name='cr-evals' -c user.email='cr-evals@localhost' commit -q -m 'feat: add order lookup and pricing' --no-gpg-sign

commit() { git -C "$1" -c user.name='cr-evals' -c user.email='cr-evals@localhost' commit -q -m "$2" --no-gpg-sign; }

# eval-22: a commit whose every file scope.md skips, so cr-prepare must say empty, not ready.
skipped=.sandbox/headless-skipped
mkdir -p "$skipped/docs"
git -C "$skipped" init -q -b main
printf '# orders service\n' > "$skipped/README.md"
git -C "$skipped" add -A
commit "$skipped" 'base'
printf '# orders service\n\nRun %s to start it.\n' "\`pnpm dev\`" > "$skipped/README.md"
printf 'Release notes for 1.2.\n' > "$skipped/docs/notes.txt"
printf '{ "name": "orders", "version": "1.2.0" }\n' > "$skipped/package.json"
git -C "$skipped" add -A
commit "$skipped" 'docs: release notes for 1.2'

# eval-23: a checkout on main plus an origin holding PR #7's head under refs/pull/7/head, and a
# gh stand-in that answers `gh pr view` for it. The checkout must stay on main, untouched.
pr=.sandbox/pr
origin="$(pwd)/.sandbox/pr-origin.git"
mkdir -p "$pr/src"
git -C "$pr" init -q -b main
cp fixtures/quality-recall.ts "$pr/src/pricing.ts"
git -C "$pr" add -A
commit "$pr" 'base'
git clone -q --bare "$pr" "$origin"
git -C "$pr" remote add origin "$origin"
git -C "$pr" fetch -q origin
git -C "$pr" switch -q -c pr-7
cp fixtures/correctness/order-sync.ts "$pr/src/order-sync.ts"
git -C "$pr" add -A
commit "$pr" 'feat: sync orders to the ledger'
head="$(git -C "$pr" rev-parse HEAD)"
git -C "$pr" push -q origin "HEAD:refs/pull/7/head"
git -C "$pr" switch -q main
git -C "$pr" branch -q -D pr-7

mkdir -p .sandbox/bin
cat > .sandbox/bin/gh <<EOF
#!/usr/bin/env bash
# Stand-in for gh: answers \`gh pr view 7\` for the eval-23 sandbox and records every call.
echo "\$*" >> "$(pwd)/.sandbox/gh-calls.log"
if [ "\$1 \$2 \$3" = "pr view 7" ]; then
  printf '%s\n' '{"number":7,"url":"https://github.com/example/orders/pull/7","state":"OPEN","title":"Sync orders to the ledger","baseRefName":"main","headRefName":"feat/order-sync","headRefOid":"$head","isCrossRepository":false,"maintainerCanModify":true}'
  exit 0
fi
echo "gh stand-in: unsupported call: \$*" >&2
exit 1
EOF
chmod +x .sandbox/bin/gh

echo "code-review sandbox reset: $(pwd)/$repo, $(pwd)/$skipped, $(pwd)/$pr"
