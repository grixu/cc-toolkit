#!/usr/bin/env bash
# Gives both repos an origin, records the commit validation saw in the spec's Checked-at line, then
# lands a teammate's commit on repo-a's origin that rewrites a file the spec cites.
set -euo pipefail
: "${ORIGINS:?}"

for repo in repo-a repo-b; do
  git clone -q --bare "$repo" "$ORIGINS/$repo.git"
  git -C "$repo" remote add origin "$ORIGINS/$repo.git"
  git -C "$repo" fetch -q origin
  git -C "$repo" branch -q --set-upstream-to=origin/main main
  sha="$(git -C "$repo" rev-parse --short HEAD)"
  sed -i.bak "s/@@SHA:$repo@@/$sha/" spec/rollout-spec.md
  rm spec/rollout-spec.md.bak
done

teammate="$(mktemp -d)"
git clone -q "$ORIGINS/repo-a.git" "$teammate/repo-a"
cat > "$teammate/repo-a/services/ledger/src/api/entries.ts" <<'TS'
export interface LedgerEntry {
  orderId: string;
  amountMinor: number;
  direction: "debit" | "credit";
  currency: string;
}

export async function listEntries(orderId: string, limit = 50): Promise<LedgerEntry[]> {
  void orderId;
  void limit;
  return [];
}
TS
git -C "$teammate/repo-a" -c user.name='teammate' -c user.email='teammate@localhost' \
  commit -q -am 'feat(ledger): add currency and a page limit to entries' --no-gpg-sign
git -C "$teammate/repo-a" push -q origin main
rm -rf "$teammate"
