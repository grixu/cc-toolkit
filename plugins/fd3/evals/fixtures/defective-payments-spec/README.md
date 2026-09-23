# payments-service

Charges cards and delivers `charge.settled` webhooks to merchants.

- `src/server.ts` — HTTP entry point: `POST /charges` behind the merchant API key, `GET /metrics`
- `src/billing/` — charge entry point and idempotency handling
- `src/webhooks/` — event enqueueing
- `src/queue/` — the delivery worker and the poller that drains the queue into it
- `src/store/` — idempotency key storage (in-memory today)
- `src/orders/`, `src/db.ts`, `migrations/` — the orders schema in Postgres
- `deploy/manifest.yaml`, `.github/workflows/deploy.yml` — CI migrates and deploys on merge to `main`
