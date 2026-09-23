# payments-service

Charges cards and delivers `charge.settled` webhooks to merchants.

- `src/billing/` — charge entry point and idempotency handling
- `src/webhooks/` — event enqueueing
- `src/queue/` — the delivery worker
- `src/store/` — idempotency key storage (in-memory today)
