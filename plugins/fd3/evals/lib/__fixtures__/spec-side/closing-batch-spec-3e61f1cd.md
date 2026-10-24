## 3. Design decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Webhooks are received by a new listener process, separate from the API server, on a port of its own** | Q1 b. Flips if the carrier traffic were to share the API server's process and port (`src/server.ts:4`), which the user declined. |
| D2 | **Every request is verified with HMAC-SHA256 over the raw body; the shared secret is Secret Manager secret `carrier-webhook-secret`, declared in a new `infra/secrets.tf`** | Q2 a. Follows the existing pattern of secrets declared in Terraform (`infra/main.tf:1-7`); no signing secret exists today. |
| D3 | **Verified events go onto a `bullmq` queue on the existing Redis instance; a worker drains it and calls `setStatus`** | Q3 a. Reuses `shipment-tracker-cache` (`infra/main.tf:9-12`); cost accepted: a new dependency and the noeviction prerequisite in section 4. |
| D4 | **A body larger than the maximum size is rejected with 413 before the signature is checked** | Q4 a. The HMAC is never computed over an oversized body; the value is D8. |
| D5 | **The worker drops an event whose carrier event id it has already processed** | Q5 b. Carriers redeliver; the store has no idempotency of its own (`src/shipments.ts:16-19`). |
| D6 | **The worker runs inside the API server process, started from `src/server.ts`** | assistant-taken, from D3: the store is an in-process `Map` (`src/shipments.ts:10`), so `setStatus` in any other process would never reach what `GET` serves. Flips when the store moves to a shared database. |
| D7 | **Q2 a's ratification is the explicit consent `CLAUDE.md:7-8` requires for creating `infra/secrets.tf`; no other file under `infra/` is touched** | assistant-taken, from Q2 a, which named the new file. Flips if the user withholds consent, in which case INFRA-1 leaves the spec. |
| D8 | **The maximum body size is 64 KiB (65 536 bytes)** | assistant-taken, from Q4 a, which set no value. No carrier payload size is documented (G1); the value is a guess at headroom over a single JSON event. |
| D9 | **The listener serves `POST /carrier/webhooks` on `WEBHOOK_PORT` (default 8081) and reads `CARRIER_WEBHOOK_SECRET` and `REDIS_URL` from the environment** | assistant-taken, from D1 and D2. 8081 is the next port after the API server's default 8080 (`src/server.ts:4`); the code has no Redis connection setting today. |
| D10 | **Listener responses: 202 once queued, 401 on a missing or invalid signature, 400 on a body that is not valid JSON, 413 over D8, 503 when the enqueue fails, 404 for any other method or path** | assistant-taken, from D2, D4 and risk R1; 503 is the answer R1 names. |
| D11 | **Dedup marker is Redis key `carrier-event:<eventId>`, set with `SET NX EX 604800` (7 days) before `setStatus`, deleted if `setStatus` throws** | assistant-taken, from D5. The TTL rule is "longer than the carrier's maximum redelivery window"; 7 days is provisional until TRK-41 (G2) gives the window. |
| D12 | **The worker resolves the shipment by `carrierTrackingId`; an event for an unknown tracking id is dropped and logged** | assistant-taken, from D3: `setStatus` takes the shipment id (`src/shipments.ts:16`), and the carrier knows only its tracking id (`src/shipments.ts:5`). |
| D13 | **`bullmq` is pinned exactly at 6.4.2; queue `carrier-events` keeps BullMQ's default of one attempt** | assistant-taken, from D3. Exact pins follow `package.json:9-10`; one attempt means a throwing job moves to the failed set with no retry. |


## Declared gaps

| # | Gap | Owner | Placement |
|---|---|---|---|
| G1 | Which carrier, its signature header name and encoding, payload field names, and status vocabulary | Carrier integrations team | Blocks finishing W4–W7 (merge of unit B) |
| G2 | The carrier's redelivery schedule; it sets D11's TTL and R1's exposure | Carrier integrations team | TRK-41; D11's TTL is revised when it lands |
| G3 | How environment variables and secrets reach the processes, and how a second process (API-1) is deployed | Spec team | Blocks phase 3's deploy |
| G4 | How Terraform is applied and which environments exist, in what order | Spec team | Gate after phase 1 |
| G5 | Who generates the shared secret value and adds it as a version | Carrier integrations team | Gate after phase 1 |
| G6 | Tracker check for an epic and existing tickets | Spec team | Before the task split |

