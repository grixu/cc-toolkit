Lens: readability-tests · files judged: 7 of 7

## FINDINGS (primary)
- `readability` · magic-literal · medium · `src/campaigns/throttle.ts:L2` — `500` is the mail provider's per-call recipient cap, and nothing at the division names it → name `MAX_RECIPIENTS_PER_CALL` at the top of `throttle.ts` and divide by it

The change carries no test files, so the `tests` family has nothing to judge.
