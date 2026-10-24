I've written the spec, and it's ready for your answers. It is a draft until you answer the questions at the end, which cover the 8 decisions I took while writing (D6–D13).

**Where it is:** `spec/out.md` (264 lines, about 2,900 words).
- The `spec/` directory did not exist. I created it rather than stopping, since nobody could answer during the run.
- The closing notes moved to `spec/out.notes.md` and the research to `spec/out.research/` (`INDEX.md`, `current-intake.md`, plus a new `bullmq-redis.md`).
- I added entry I5 to the index and rewrote the paths in the notes. The moves are staged with `git mv`; nothing is committed.

**Counts:**
- 13 decision rows: D1–D5 are your Q1–Q5 choices, D6–D13 are mine.
- 1 accepted risk (R1).
- 10 element codes defined in section 4, and every code used elsewhere is among them: API-1, INTEGRATION-1, INTEGRATION-2, DB-1, DB-2, CONFIG-1, CONFIG-2, INFRA-1, TEST-1, TEST-2.
- 7 work items across 3 phases in 2 landing units, 9 verification rows, 19 evidence rows, 6 declared gaps (G1–G6).
- Every entry in the closing notes lands somewhere: Q1–Q5 in D1–D5 (Q2 also in D7, Q4 also in D8), the accepted risk in R1, and the item left for later in G2 and out-of-scope item 2 (TRK-41).
- The estimated change is about 8 files and a few hundred lines, so no split is needed.

**Citations:** I checked all 15 local `path:line` citations against the files myself. One I did not: bullmq's own `package.json:94`, which comes from the research report.

**Found while writing:**
- **Redis eviction setting:** BullMQ requires Redis to never evict keys (`maxmemory-policy noeviction`). Memorystore's default is `volatile-lru` and `infra/main.tf:9-12` doesn't override it. I put the fix out of scope (it would edit `infra/main.tf`, which is protected) and made it block the listener's deploy.
- **Worker placement:** the shipment store is an in-process `Map` (`src/shipments.ts:10`). So the worker has to run inside the API server process, or its `setStatus` calls never reach what `GET` serves.
- **Unused Redis client:** `ioredis` is in `package.json`, but no file in `src/` imports it.

**Not settled:**
- **G1:** the carrier's webhook contract (signature header and encoding, payload fields, status names). Owner: carrier integrations team. Blocks finishing W4–W7.
- **G2:** the carrier's redelivery schedule, TRK-41. It sets D11's expiry time and how much R1 can lose.
- **G3:** how environment variables, secrets and a second process get deployed. Nothing in the repo shows this, and it blocks the listener's deploy.
- **G4:** how Terraform is applied and which environments exist. The repo has no pipeline.
- **G5:** who generates the shared secret value and adds it.
- **G6:** I couldn't reach the tracker, so tickets beyond TRK-41 are unchecked.
- I didn't run any probes. The verification commands in section 8 are unrun.

**Questions** (recommendation first):

1. **ADRs:** should we write them? `docs/CLAUDE.md:5-6` says it's your call, and ADR-0001 asks for one per mechanism before dependent work lands. Recommend yes: ADR-0002 for the separate listener process (D1) and ADR-0003 for the BullMQ queue (D3), added to phase 1. The spec has no ADR work today.
2. **Redis eviction:** recommend setting `redis_configs = { "maxmemory-policy" = "noeviction" }` on `shipment-tracker-cache` in `infra/main.tf`, inside this spec. Nothing in `src/` uses Redis yet, so it costs nothing today. Do you consent to editing that protected file? The alternative is a separate Redis instance.
3. **D6:** "The worker runs inside the API server process, started from `src/server.ts`." Recommend yes, because the store is in-process memory.
4. **D7:** "Q2 a's ratification is the explicit consent `CLAUDE.md:7-8` requires for creating `infra/secrets.tf`; no other file under `infra/` is touched." Recommend you confirm the consent explicitly.
5. **D8:** "The maximum body size is 64 KiB (65 536 bytes)." Recommend keeping it until the carrier contract (G1) gives a real payload size. I chose this value myself.
6. **D9:** "The listener serves `POST /carrier/webhooks` on `WEBHOOK_PORT` (default 8081) and reads `CARRIER_WEBHOOK_SECRET` and `REDIS_URL` from the environment." Recommend yes.
7. **D10:** "Listener responses: 202 once queued, 401 on a missing or invalid signature, 400 on a body that is not valid JSON, 413 over D8, 503 when the enqueue fails, 404 for any other method or path." Recommend yes.
8. **D11:** "Dedup marker is Redis key `carrier-event:<eventId>`, set with `SET NX EX 604800` (7 days) before `setStatus`, deleted if `setStatus` throws." Recommend yes, with the 7 days revised once TRK-41 gives the redelivery window.
9. **D12:** "The worker resolves the shipment by `carrierTrackingId`; an event for an unknown tracking id is dropped and logged." Recommend yes.
10. **D13:** "`bullmq` is pinned exactly at 6.4.2; queue `carrier-events` keeps BullMQ's default of one attempt." Recommend yes: `setStatus` writes to an in-memory map and is unlikely to fail, so retries would add little.