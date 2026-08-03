# defective-payments-spec — planted defects

This file is fixture documentation only. `reset-sandboxes.sh` excludes it from the sandbox copy.
Every line below is load-bearing for the validate-defective-spec assertions — editing the spec or the source files
without re-checking this list breaks the eval.

## The five defects (and the check each must trip)

1. **D2 vs D5 contradict** (check 1) — section 3: D2 says webhook events are processed
   synchronously in the request path; D5 says webhook processing is queued. Both cite rationale;
   neither is marked as superseding the other.
2. **Stale citation** (citation rule / evidence spot-check) — section 12, row "The provider charge
   call carries an 8-second timeout" cites `src/billing/charge.ts:42`. The file is exactly 30
   lines; the fact actually lives at `src/billing/charge.ts:27`. The skill must CORRECT the
   citation in the spec, not merely report it. The assertion requires every
   `src/billing/charge.ts:N` in the spec BODY (before the appended dated evidence
   sub-heading) to have N <= 30 — the appended narration may legitimately quote the old
   `:42` when documenting the correction.
3. **Undecided either/or** (check 12) — section 3, D4: "Idempotency keys are stored in Redis or
   Postgres" with no decision recorded and no named owner.
4. **Out-of-scope item without owner or placement** (check 2 / out-of-scope rule) — section 10:
   "Invoice PDF rendering." has no owner and no placement (contrast with the refund-webhooks item,
   which has both).
5. **Element with a full contract but no element code** (check 3) — section 4: "Delivery retry
   worker" has description, fields, errors, auth and limits but no `PREFIX-n` code; section 6 item
   3 cites it by name and section heading instead of by code.

## Load-bearing line numbers in the source files

- `src/billing/charge.ts` — exactly 30 lines; `getIdempotencyKey` lookup at line 16;
  `providerTimeoutMs = 8000` at line 27.
- `src/queue/worker.ts` — `MAX_DELIVERY_ATTEMPTS = 5` at line 3; retry loop at line 6.
- `src/store/idempotency.ts` — `new Map` at line 3; functions at lines 5 and 9.
- `src/webhooks/enqueue.ts` — `enqueueWebhook` at line 8.

Everything else in the spec is deliberately clean: all other citations resolve, the decision table
is otherwise consistent, every other element carries a code, the evidence table exists and its
other rows are true. The five defects above must be the ONLY findings.
