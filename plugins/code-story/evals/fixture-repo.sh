#!/usr/bin/env bash
# Builds a small TypeScript repo in the current directory: main plus feat/retry-cap with two
# commits, pushed to a bare origin inside the workspace so `git fetch origin` needs no network.
# Commit 1 states its reason; commit 2 does not, so a story must say the reason is missing.
set -euo pipefail

export GIT_AUTHOR_NAME="Eval Author" GIT_AUTHOR_EMAIL="eval@example.com"
export GIT_COMMITTER_NAME="Eval Author" GIT_COMMITTER_EMAIL="eval@example.com"
export GIT_AUTHOR_DATE="2026-11-01T10:00:00Z" GIT_COMMITTER_DATE="2026-11-01T10:00:00Z"

git init --quiet --initial-branch=main .
mkdir -p src

cat > package.json <<'EOF'
{
  "name": "fetch-retry",
  "version": "1.0.0",
  "type": "module"
}
EOF

cat > src/retry.ts <<'EOF'
export const BASE_DELAY_MS = 500;

const RETRYABLE_STATUSES = new Set([502, 503, 504]);

export function computeDelay(attempt: number): number {
  return BASE_DELAY_MS * 2 ** attempt;
}

export function isRetryable(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

export async function fetchWithRetry(url: string, maxAttempts = 5): Promise<Response> {
  let last: Response | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    last = await fetch(url);
    if (!isRetryable(last.status)) return last;
    await new Promise((resolve) => setTimeout(resolve, computeDelay(attempt)));
  }
  return last!;
}
EOF

git add -A
git commit --quiet -m "feat: fetch with exponential retry"

git switch --quiet -c feat/retry-cap

cat > src/retry.ts <<'EOF'
export const BASE_DELAY_MS = 500;
export const MAX_DELAY_MS = 30_000;

const RETRYABLE_STATUSES = new Set([502, 503, 504]);

export function computeDelay(attempt: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
}

export function isRetryable(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

export async function fetchWithRetry(url: string, maxAttempts = 5): Promise<Response> {
  let last: Response | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    last = await fetch(url);
    if (!isRetryable(last.status)) return last;
    await new Promise((resolve) => setTimeout(resolve, computeDelay(attempt)));
  }
  return last!;
}
EOF

export GIT_AUTHOR_DATE="2026-11-02T10:00:00Z" GIT_COMMITTER_DATE="2026-11-02T10:00:00Z"
git commit --quiet -am "fix(retry): cap the backoff at 30 s" -m "The gateway drops connections that sit idle for more than 60 s, so the uncapped delay made the later retries fail before they were sent."

sed -i.bak 's/new Set(\[502, 503, 504\])/new Set([429, 502, 503, 504])/' src/retry.ts
rm -f src/retry.ts.bak

export GIT_AUTHOR_DATE="2026-11-03T10:00:00Z" GIT_COMMITTER_DATE="2026-11-03T10:00:00Z"
git commit --quiet -am "fix(retry): retry on 429"

git init --quiet --bare .origin.git
echo ".origin.git/" >> .git/info/exclude
git remote add origin "$PWD/.origin.git"
git push --quiet origin main feat/retry-cap
git branch --quiet --set-upstream-to=origin/feat/retry-cap
