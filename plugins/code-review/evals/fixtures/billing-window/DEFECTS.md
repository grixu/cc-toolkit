# Planted findings — billing-window (PR #9 in `.sandbox/pr`)

`reset-sandbox.sh` puts `base.ts` on `main` as `src/billing-window.ts` and pushes PR #9: the
eval-23/24 head (which adds `src/order-sync.ts`, the `correctness/` fixture) plus one commit that
replaces it with `head.ts`. The gh stand-in names `colleague` as the author, so the run is in
reviewer mode. `lenses/` holds the files the eight active Scanners would have written into
`.sandbox/pr9-ctx`; neither it nor this file reaches the checkout.

## The PR's hunks

- `src/order-sync.ts` is added whole: one hunk, L1-L54.
- `src/billing-window.ts` changes `30 * DAY_MS` to `45 * DAY_MS` at L19: one hunk, `@@ -16,5 +16,5 @@`, L16-L20.

## What the lens files carry

| finding | site | where the draft puts it |
|---|---|---|
| `correctness` · off-by-one · high, the last page never fetched | `src/order-sync.ts:L13` | inline, opening `issue:` |
| `correctness` · swallowed-error · medium, a failed post returns ok | `src/order-sync.ts:L20-L25` | left out: `reviewer-a` already raised it |
| `readability` · magic-literal · medium, `45` | `src/billing-window.ts:L19` | inline |
| `readability` · magic-literal · medium, `86400 * 1000` | `src/order-sync.ts:L53` | inline |
| comments R9 REWRITE, the doc still says "30 days after issue" | `src/billing-window.ts:L5` | the review body, under its path: L5 is outside every hunk |

## Review comments already on the PR

`review-comments.json` is what the `gh` stand-in answers for
`GET repos/example/orders/pulls/9/comments` (`reset-sandbox.sh` fills in the head SHA):

- `reviewer-a` on `src/order-sync.ts:L20-L25` raises the swallowed `ledger.post` failure, the
  lens's `swallowed-error` point: the draft leaves that finding out, and the wrap-up names it once
  with `reviewer-a`.
- `reviewer-a` on `src/order-sync.ts:L13` asks for `pageIndex`, a naming nit: the same line as
  the off-by-one but another point, so the off-by-one is still drafted.

## Suggestion blocks

- The off-by-one at `src/order-sync.ts:L13` is fixed by replacing that one line
  (`page < totalPages - 1` → `page < totalPages`), inside its hunk, so its comment ends with a
  `suggestion` block that commits the fix alone.
- The `45` at `src/billing-window.ts:L19` is fixed by a constant declared beside `DAY_MS` at L3,
  outside every hunk: a block over L19 alone would name a constant that does not exist, so that fix
  stays in prose.

The R9 verdict is real because the change, not the comment, moved: the doc at L5 was true on
`main` and the commit at L19 made it false.
