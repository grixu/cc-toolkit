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

# evals 23-24 and 27: a checkout on main plus an origin holding PR heads under refs/pull/<n>/head,
# and a gh stand-in. PR #7 is the gh user's own; #8 is the same head by someone else; #9, also
# someone else's, adds a commit that changes a base file, so its diff has lines outside every hunk.
# The checkout must stay on main, untouched.
pr=.sandbox/pr
origin="$(pwd)/.sandbox/pr-origin.git"
mkdir -p "$pr/src"
git -C "$pr" init -q -b main
cp fixtures/quality-recall.ts "$pr/src/pricing.ts"
cp fixtures/billing-window/base.ts "$pr/src/billing-window.ts"
git -C "$pr" add -A
commit "$pr" 'base'
pr_base="$(git -C "$pr" rev-parse HEAD)"
git clone -q --bare "$pr" "$origin"
git -C "$pr" remote add origin "$origin"
git -C "$pr" fetch -q origin
git -C "$pr" switch -q -c pr-7
cp fixtures/correctness/order-sync.ts "$pr/src/order-sync.ts"
git -C "$pr" add -A
commit "$pr" 'feat: sync orders to the ledger'
head="$(git -C "$pr" rev-parse HEAD)"
git -C "$pr" push -q origin "HEAD:refs/pull/7/head" "HEAD:refs/pull/8/head"
cp fixtures/billing-window/head.ts "$pr/src/billing-window.ts"
git -C "$pr" add -A
commit "$pr" 'feat: give invoices a 45-day payment term'
head9="$(git -C "$pr" rev-parse HEAD)"
git -C "$pr" push -q origin "HEAD:refs/pull/9/head"
git -C "$pr" switch -q main
git -C "$pr" branch -q -D pr-7

mkdir -p .sandbox/bin
cat > .sandbox/bin/gh <<EOF
#!/usr/bin/env bash
# Stand-in for gh: answers \`gh pr view 7|8|9\` and \`gh api user\`, takes a POST of a PR review
# (keeping its --input body as .sandbox/gh-posted-<n>.json), answers any other GET under pulls/
# with an empty list, and records every call.
echo "\$*" >> "$(pwd)/.sandbox/gh-calls.log"
if [ "\$1 \$2" = "api user" ]; then
  echo eval-user
  exit 0
fi
if [ "\$1 \$2" = "pr view" ]; then
  title='Sync orders to the ledger' ref=feat/order-sync oid=$head
  case "\$3" in
    7) author=eval-user ;;
    8) author=colleague ;;
    9) author=colleague title='Give invoices a 45-day payment term' ref=feat/payment-term oid=$head9 ;;
    *) echo "gh stand-in: no PR \$3" >&2; exit 1 ;;
  esac
  printf '{"number":%s,"url":"https://github.com/example/orders/pull/%s","state":"OPEN","title":"%s","author":{"login":"%s"},"baseRefName":"main","headRefName":"%s","headRefOid":"%s","isCrossRepository":false,"maintainerCanModify":true}\n' "\$3" "\$3" "\$title" "\$author" "\$ref" "\$oid"
  exit 0
fi
if [ "\$1" = "api" ]; then
  path='' post='' input=''
  shift
  while [ \$# -gt 0 ]; do
    case "\$1" in
      --method|-X) [ "\$2" = POST ] && post=1; shift ;;
      --method=POST|-XPOST) post=1 ;;
      --input) input="\$2"; shift ;;
      --input=*) input="\${1#--input=}" ;;
      repos/*|/repos/*) path="\$1" ;;
    esac
    shift
  done
  n="\$(printf '%s' "\$path" | sed -n 's#.*pulls/\([0-9]*\)/reviews\$#\1#p')"
  if [ -n "\$post" ] && [ -n "\$n" ] && [ -f "\$input" ]; then
    cp "\$input" "$(pwd)/.sandbox/gh-posted-\$n.json"
    printf '{"id":1,"state":"COMMENTED","html_url":"https://github.com/example/orders/pull/%s#pullrequestreview-1"}\n' "\$n"
    exit 0
  fi
  case "\$path" in
    *pulls/*) [ -z "\$post" ] && { echo '[]'; exit 0; } ;;
  esac
fi
echo "gh stand-in: unsupported call: \$*" >&2
exit 1
EOF
chmod +x .sandbox/bin/gh

# eval-27: PR #9's review already ran through Step 3. The context directory names the detached
# worktree Step 1 makes as the checkout, so the run goes from Step 1 straight to the merge.
pr9_ctx="$(pwd)/.sandbox/pr9-ctx"
mkdir -p "$pr9_ctx"
cp fixtures/billing-window/lenses/*.md "$pr9_ctx/"
printf 'No project convention files: no CODING_STANDARDS.md, CLAUDE.md, AGENTS.md, CONTRIBUTING.md, .cursor/rules or .claude/rules at the repository root or along the reviewed paths.\n' > "$pr9_ctx/conventions.md"
printf 'none\n' > "$pr9_ctx/standards.md"
pr9_lenses="$(for l in comments readability-tests naming-module objects-patterns simplicity-types correctness security performance; do printf '      { "lens": "%s", "files": ["src/billing-window.ts", "src/order-sync.ts"] },\n' "$l"; done)"
cat > "$pr9_ctx/scope.json" <<EOF
{
  "checkout": "$(pwd)/$pr.worktrees/cr-pr-9",
  "base": "$pr_base",
  "diff_args": ["$pr_base..HEAD"],
  "files": [
    { "path": "src/billing-window.ts", "status": "M", "kind": "source", "untracked": false },
    { "path": "src/order-sync.ts", "status": "A", "kind": "source", "untracked": false }
  ],
  "skipped": [],
  "spec": null,
  "spec_focus": null,
  "lenses": {
    "active": [
${pr9_lenses%,}
    ],
    "inactive": [{ "lens": "spec", "reason": "no spec named" }]
  }
}
EOF

# eval-26: a branch whose review already ran through Step 3. The context directory holds the
# scope.json Step 2b writes and every active lens's file, so start-cr starts at the merge with no
# Scanner. An untracked file stands for the user's own work, which no commit may pick up.
mailer=.sandbox/mailer
mailer_ctx="$(pwd)/.sandbox/mailer-ctx"
src=fixtures/campaign-mailer
mkdir -p "$mailer" "$mailer_ctx"
git -C "$mailer" init -q -b main
cp -R "$src/base/." "$mailer/"
git -C "$mailer" add -A
commit "$mailer" 'feat: render and schedule newsletters'
mailer_base="$(git -C "$mailer" rev-parse HEAD)"
git -C "$mailer" switch -q -c feat/weekly-digest
for f in schedule throttle recipients sender; do cp "$src/head/src/campaigns/$f.ts" "$mailer/src/campaigns/"; done
git -C "$mailer" add -A
commit "$mailer" 'feat: schedule campaigns and filter their recipients'
cp "$src/head/src/campaigns/audience.ts" "$src/head/src/campaigns/dispatch.ts" "$mailer/src/campaigns/"
cp "$src/head/src/templates/digest.ts" "$mailer/src/templates/"
git -C "$mailer" add -A
commit "$mailer" 'feat: plan the weekly digest'
git -C "$mailer" rev-parse HEAD > .sandbox/mailer.head
printf 'ask ops whether the Monday send window moves in December\n' > "$mailer/scratch-notes.txt"

cp "$src"/lenses/*.md "$mailer_ctx/"
printf 'No project convention files: no CODING_STANDARDS.md, CLAUDE.md, AGENTS.md, CONTRIBUTING.md, .cursor/rules or .claude/rules at the repository root or along the reviewed paths.\n' > "$mailer_ctx/conventions.md"
printf 'none\n' > "$mailer_ctx/standards.md"
judged='"src/campaigns/audience.ts", "src/campaigns/dispatch.ts", "src/campaigns/recipients.ts", "src/campaigns/schedule.ts", "src/campaigns/sender.ts", "src/campaigns/throttle.ts", "src/templates/digest.ts"'
lens() { printf '      { "lens": "%s", "files": [%s] }' "$1" "$judged"; }
cat > "$mailer_ctx/scope.json" <<EOF
{
  "checkout": "$(pwd)/$mailer",
  "base": "$mailer_base",
  "diff_args": ["$mailer_base..HEAD"],
  "files": [
    { "path": "src/campaigns/audience.ts", "status": "M", "kind": "source", "untracked": false },
    { "path": "src/campaigns/dispatch.ts", "status": "A", "kind": "source", "untracked": false },
    { "path": "src/campaigns/recipients.ts", "status": "A", "kind": "source", "untracked": false },
    { "path": "src/campaigns/schedule.ts", "status": "A", "kind": "source", "untracked": false },
    { "path": "src/campaigns/sender.ts", "status": "A", "kind": "source", "untracked": false },
    { "path": "src/campaigns/throttle.ts", "status": "A", "kind": "source", "untracked": false },
    { "path": "src/templates/digest.ts", "status": "A", "kind": "source", "untracked": false }
  ],
  "skipped": [],
  "spec": null,
  "spec_focus": null,
  "lenses": {
    "active": [
$(for l in comments readability-tests naming-module objects-patterns simplicity-types correctness security; do lens "$l"; printf ',\n'; done; lens performance)
    ],
    "inactive": [{ "lens": "spec", "reason": "no spec named" }]
  }
}
EOF

echo "code-review sandbox reset: $(pwd)/$repo, $(pwd)/$skipped, $(pwd)/$pr, $(pwd)/$mailer"
