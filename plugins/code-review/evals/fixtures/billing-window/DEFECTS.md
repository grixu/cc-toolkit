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
| `correctness` · swallowed-error · medium, a failed post returns ok | `src/order-sync.ts:L20-L25` | inline |
| `readability` · magic-literal · medium, `45` | `src/billing-window.ts:L19` | inline |
| `readability` · magic-literal · medium, `86400 * 1000` | `src/order-sync.ts:L53` | inline |
| comments R9 REWRITE, the doc still says "30 days after issue" | `src/billing-window.ts:L5` | the review body, under its path: L5 is outside every hunk |

The R9 verdict is real because the change, not the comment, moved: the doc at L5 was true on
`main` and the commit at L19 made it false.
