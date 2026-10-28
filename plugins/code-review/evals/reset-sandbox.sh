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
cp cases/security-recall.ts "$repo/src/security-recall.ts"
cp cases/quality-recall.ts "$repo/src/quality-recall.ts"
git -C "$repo" add -A
git -C "$repo" -c user.name='cr-evals' -c user.email='cr-evals@localhost' commit -q -m 'feat: add order lookup and pricing' --no-gpg-sign

commit() { git -C "$1" -c user.name='cr-evals' -c user.email='cr-evals@localhost' commit -q -m "$2" --no-gpg-sign; }

# eval-22: a commit whose every file scope.md skips, all of them prose or config data coherence
# reads, so cr-prepare must say ready with coherence the only active lens.
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
cp cases/quality-recall.ts "$pr/src/pricing.ts"
cp cases/billing-window/base.ts "$pr/src/billing-window.ts"
git -C "$pr" add -A
commit "$pr" 'base'
pr_base="$(git -C "$pr" rev-parse HEAD)"
git clone -q --bare "$pr" "$origin"
git -C "$pr" remote add origin "$origin"
git -C "$pr" fetch -q origin
git -C "$pr" switch -q -c pr-7
cp cases/correctness/order-sync.ts "$pr/src/order-sync.ts"
git -C "$pr" add -A
commit "$pr" 'feat: sync orders to the ledger'
head="$(git -C "$pr" rev-parse HEAD)"
git -C "$pr" push -q origin "HEAD:refs/pull/7/head" "HEAD:refs/pull/8/head"
# PR #9's earlier revision, which its outdated review comments were made on: isStale's signature and
# the payment term differ there, and the next commit settles both.
sed 's/syncedAt: number, now: number/syncedAt: number, now = Date.now()/' cases/correctness/order-sync.ts > "$pr/src/order-sync.ts"
sed 's/30 \* DAY_MS/60 * DAY_MS/' cases/billing-window/base.ts > "$pr/src/billing-window.ts"
git -C "$pr" add -A
commit "$pr" 'feat: give invoices a 60-day payment term'
rev9="$(git -C "$pr" rev-parse HEAD)"
cp cases/correctness/order-sync.ts "$pr/src/order-sync.ts"
cp cases/billing-window/head.ts "$pr/src/billing-window.ts"
git -C "$pr" add -A
commit "$pr" 'feat: give invoices a 45-day payment term'
head9="$(git -C "$pr" rev-parse HEAD)"
git -C "$pr" push -q origin "HEAD:refs/pull/9/head"
git -C "$pr" switch -q main
git -C "$pr" branch -q -D pr-7

mkdir -p .sandbox/bin
cat > .sandbox/bin/gh <<EOF
#!/usr/bin/env bash
# Stand-in for gh: answers \`gh pr view 7|8|9\`, \`gh pr view\` on a branch that has a PR, and
# \`gh api user\` (eval-user, or the checkout's cr-evals.gh-user git config), filters any of them
# through --jq like gh does, takes a POST of a PR review
# (keeping its --input body as .sandbox/gh-posted-<n>.json), answers PR #9's review comments from
# .sandbox/gh-pr9-comments.json and any other GET under pulls/ with an empty list, and records
# every call with the directory it ran in.
echo "\$* # in \$PWD" >> "$(pwd)/.sandbox/gh-calls.log"
jq_expr='' args=()
while [ \$# -gt 0 ]; do
  case "\$1" in
    --jq|-q) jq_expr="\$2"; shift ;;
    --jq=*) jq_expr="\${1#--jq=}" ;;
    *) args+=("\$1") ;;
  esac
  shift
done
set -- "\${args[@]}"
emit() { if [ -n "\$jq_expr" ]; then jq -r "\$jq_expr"; else cat; fi; }
if [ "\$1 \$2" = "api user" ]; then
  printf '{"login":"%s"}\n' "\$(git config --get cr-evals.gh-user || echo eval-user)" | emit
  exit 0
fi
if [ "\$1 \$2" = "pr view" ]; then
  n="\$3"
  case "\$n" in
    ''|-*)
      branch="\$(git branch --show-current 2>/dev/null)"
      case "\$branch" in
        feat/payment-term) n=9 ;;
        *) echo "no pull requests found for branch \"\$branch\"" >&2; exit 1 ;;
      esac ;;
  esac
  title='Sync orders to the ledger' ref=feat/order-sync oid=$head
  case "\$n" in
    7) author=eval-user ;;
    8) author=colleague ;;
    9) author=colleague title='Give invoices a 45-day payment term' ref=feat/payment-term oid=$head9 ;;
    *) echo "gh stand-in: no PR \$n" >&2; exit 1 ;;
  esac
  printf '{"number":%s,"url":"https://github.com/example/orders/pull/%s","state":"OPEN","title":"%s","author":{"login":"%s"},"baseRefName":"main","headRefName":"%s","headRefOid":"%s","isCrossRepository":false,"maintainerCanModify":true}\n' "\$n" "\$n" "\$title" "\$author" "\$ref" "\$oid" | emit
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
      -H|--header|-f|-F|--field|--raw-field) shift ;;
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
    *pulls/9/comments*) [ -z "\$post" ] && { emit < "$(pwd)/.sandbox/gh-pr9-comments.json"; exit 0; } ;;
    *pulls/*) [ -z "\$post" ] && { echo '[]' | emit; exit 0; } ;;
  esac
fi
echo "gh stand-in: unsupported call: \$*" >&2
exit 1
EOF
chmod +x .sandbox/bin/gh
# The review comments already on PR #9, which eval-27's draft must not repeat.
sed -e "s/HEAD_OID/$head9/g" -e "s/REV9_OID/$rev9/g" cases/billing-window/review-comments.json > .sandbox/gh-pr9-comments.json

# eval-31: a clone of the PR origin with PR #9's head checked out on its branch, as a reviewer who
# fetched a colleague's branch would have it. Run with no --pr, start-cr must offer reviewer mode.
local_pr=.sandbox/pr-local
git clone -q "$origin" "$local_pr"
git -C "$local_pr" fetch -q origin refs/pull/9/head
git -C "$local_pr" switch -q -c feat/payment-term FETCH_HEAD

# eval-32: eval-31's clone, but its gh user is colleague, PR #9's author, so the branch is the
# user's own PR and start-cr must not offer reviewer mode.
own_pr=.sandbox/pr-local-own
git clone -q "$origin" "$own_pr"
git -C "$own_pr" fetch -q origin refs/pull/9/head
git -C "$own_pr" switch -q -c feat/payment-term FETCH_HEAD
git -C "$own_pr" config cr-evals.gh-user colleague

# eval-27: PR #9's review already ran through Step 3. The context directory names the detached
# worktree Step 1 makes as the checkout, so the run goes from Step 1 straight to the merge.
pr9_ctx="$(pwd)/.sandbox/pr9-ctx"
mkdir -p "$pr9_ctx"
cp cases/billing-window/lenses/*.md "$pr9_ctx/"
printf 'No project convention files: no CODING_STANDARDS.md, CLAUDE.md, AGENTS.md, CONTRIBUTING.md, .cursor/rules or .claude/rules at the repository root or along the reviewed paths.\n' > "$pr9_ctx/conventions.md"
printf 'none\n' > "$pr9_ctx/standards.md"
pr9_lenses="$(for l in comments readability-tests naming-module objects-patterns simplicity-types correctness security coherence assumptions performance; do printf '      { "lens": "%s", "files": ["src/billing-window.ts", "src/order-sync.ts"] },\n' "$l"; done)"
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
src=cases/campaign-mailer
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
$(for l in comments readability-tests naming-module objects-patterns simplicity-types correctness security coherence assumptions; do lens "$l"; printf ',\n'; done; lens performance)
    ],
    "inactive": [{ "lens": "spec", "reason": "no spec named" }]
  }
}
EOF

# eval-28: a checkout of its own, so a Grep for the project's tag searches these files and not the
# fixture's DEFECTS.md, which names the verdict.
marker=.sandbox/arch-marker
mkdir -p "$marker"
git -C "$marker" init -q -b main
cp -R cases/arch-marker/src "$marker/"
git -C "$marker" add -A
commit "$marker" 'feat: order cancellation'

# evals 29-30: a branch with one committed source change above origin/main and an uncommitted side.
# In scope-skip that side is a lockfile bump and a rebuilt dist/ file, which no lens grades, so Step 1
# has nothing to ask. In scope-mixed it is Markdown and JSON, which coherence grades, plus an
# untracked .ts, so the question is due. eval-33's scope-spec is scope-skip plus a spec on the base
# that the run gets as --spec: the spec lens reviews the lockfile and dist/ side, so only the spec
# makes the question due.
lockfile() { printf "lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    devDependencies:\n      typescript:\n        specifier: ^5.6.0\n        version: %s\n" "$1"; }
for name in scope-skip scope-mixed scope-spec; do
  dir=.sandbox/$name
  mkdir -p "$dir/src"
  git -C "$dir" init -q -b main
  # shellcheck disable=SC2016 # backticks are literal Markdown
  printf '# orders service\n\nRun the tests with `pnpm test`.\n' > "$dir/CLAUDE.md"
  printf 'export function orderTotal(lines: { price: number; qty: number }[]): number {\n  return lines.reduce((sum, l) => sum + l.price * l.qty, 0);\n}\n' > "$dir/src/order-service.ts"
  if [ "$name" != scope-mixed ]; then
    mkdir -p "$dir/dist"
    lockfile 5.6.3 > "$dir/pnpm-lock.yaml"
    printf 'export function orderTotal(lines) {\n    return lines.reduce((sum, l) => sum + l.price * l.qty, 0);\n}\n' > "$dir/dist/order-service.js"
  fi
  if [ "$name" = scope-spec ]; then
    mkdir -p "$dir/specs"
    # shellcheck disable=SC2016 # backticks are literal Markdown
    printf '# Order discounts\n\n1. `discountedTotal(lines, percent)` returns the order total reduced by `percent` per cent.\n2. The published build `dist/order-service.js` exports `discountedTotal`.\n3. The project builds with TypeScript 5.7.\n' > "$dir/specs/order-discount.md"
  fi
  git -C "$dir" add -A
  commit "$dir" 'base'
  git clone -q --bare "$dir" ".sandbox/$name-origin.git"
  git -C "$dir" remote add origin "$(pwd)/.sandbox/$name-origin.git"
  git -C "$dir" fetch -q origin
  git -C "$dir" switch -q -c feat/order-discount
  cat >> "$dir/src/order-service.ts" <<'TS'

export function discountedTotal(lines: { price: number; qty: number }[], percent: number): number {
  return orderTotal(lines) * (1 - percent / 100);
}
TS
  git -C "$dir" add -A
  commit "$dir" 'feat: discounted order totals'
  if [ "$name" != scope-mixed ]; then
    lockfile 5.7.2 > "$dir/pnpm-lock.yaml"
    printf 'export function discountedTotal(lines, percent) {\n    return orderTotal(lines) * (1 - percent / 100);\n}\n' >> "$dir/dist/order-service.js"
    continue
  fi
  printf '\nDiscounts are percentages, never absolute amounts.\n' >> "$dir/CLAUDE.md"
  mkdir -p "$dir/docs" "$dir/.claude"
  printf 'Open question: do discounts stack with vouchers?\n' > "$dir/docs/notes.md"
  printf '{ "permissions": { "allow": ["Bash(pnpm test)"] } }\n' > "$dir/.claude/settings.json"
done
printf 'export const MAX_DISCOUNT_PERCENT = 50;\n' > .sandbox/scope-mixed/src/discount-limits.ts

# evals 34-35: a repository of its own, so the lens Greps counterparts where DEFECTS.md is absent.
coherence=.sandbox/coherence
mkdir -p "$coherence"
cp -R cases/coherence/. "$coherence/"
rm "$coherence/DEFECTS.md"
git -C "$coherence" init -q -b main
git -C "$coherence" add -A
commit "$coherence" 'feat: notification channels, quiet hours and the outbox'

# evals 36-37: a repository whose made-up dependencies are installed but gitignored, as a real
# install is, so the lens has to find the evidence in node_modules on its own.
assumptions=.sandbox/assumptions
mkdir -p "$assumptions"
cp -R cases/assumptions/. "$assumptions/"
rm -r "$assumptions/DEFECTS.md" "$assumptions/vendor"
printf 'node_modules/\ndist/\n' > "$assumptions/.gitignore"
git -C "$assumptions" init -q -b main
git -C "$assumptions" add -A
commit "$assumptions" 'feat: invoice PDFs, dashboard audits and the audit worker'
mkdir -p "$assumptions/node_modules"
cp -R cases/assumptions/vendor/@acme "$assumptions/node_modules/"

echo "code-review sandbox reset: $(pwd)/$repo, $(pwd)/$skipped, $(pwd)/$pr, $(pwd)/$mailer, $(pwd)/$marker, $(pwd)/.sandbox/scope-skip, $(pwd)/.sandbox/scope-mixed, $(pwd)/.sandbox/scope-spec, $(pwd)/$coherence, $(pwd)/$assumptions"
