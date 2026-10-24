Lens: readability-tests · files judged: 2 of 2

## FINDINGS (primary)
- `readability` · magic-literal · medium · `src/billing-window.ts:L19` — `45` is the payment term in days, and the line that changed it names nothing → name `PAYMENT_TERM_DAYS` beside `DAY_MS` and multiply by it
- `readability` · magic-literal · medium · `src/order-sync.ts:L53` — `86400 * 1000` is one day in milliseconds, unnamed → name `DAY_MS` and compare against it

The change carries no test files, so the `tests` family has nothing to judge.
