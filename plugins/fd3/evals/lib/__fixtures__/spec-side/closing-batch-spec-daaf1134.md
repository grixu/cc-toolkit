# Carrier tracking webhooks

Carrier tracking events reach `shipment-tracker` through a signed webhook received by a new listener
process, queued on the existing Redis with `bullmq`, and applied by a worker through `setStatus`.

## 1. Header and precedence

- **Ticket:** none known beyond TRK-41 (see section 11)
- **Status:** draft — rows D6–D15 are assistant-taken and await ratification
- **Date:** 2026-10-25
- **Repository:** `shipment-tracker` at commit `ccba667` (no remote configured)
- **Companion documents:** [`../docs/adr/0001-record-decisions.md`](../docs/adr/0001-record-decisions.md),
  [`../CLAUDE.md`](../CLAUDE.md), [`../docs/CLAUDE.md`](../docs/CLAUDE.md)

**Precedence.** This spec supersedes nothing. The only decision record in the repository,
ADR 0001 (status: accepted, 2026-03-02), requires every mechanism choice to be recorded as an ADR
before dependent work lands; this spec complies with it through DOCS-1 and DOCS-2 in phase 1 and
reverses nothing in it. Reversals: none.

**Protected-path consent.** `CLAUDE.md:7-8` forbids creating or editing any file under `infra/`
without the user's explicit consent, recorded in the spec. Consent recorded here:

| Path | Change | Consent |
|---|---|---|
| `infra/secrets.tf` | New file holding INFRA-1 | Q2 option a, which names this file, ratified 2026-10-20 ("Confirmed — write it up") |
| `infra/main.tf:9-12` | INFRA-2, only under D15's condition | None yet — INFRA-2 does not land without it (closing question 10) |

## 2. Problem and goal

Carrier status never reaches the service: the API server answers only `GET /shipments/:id` and 404
for everything else (`src/server.ts:6-15`), and `setStatus` (`src/shipments.ts:16`) has no caller.
Shipment status is held in an in-process `Map` (`src/shipments.ts:10`), so only code running in the
API server process can change what `GET /shipments/:id` returns.

**Goal:** a carrier tracking event, delivered to a signed webhook, changes the status the API server
returns for the matching shipment.

## 3. Design decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **A new listener process (API-1), separate from `src/server.ts`, receives carrier webhooks on its own port** | Q1 option b. Flips if the webhook must share the API server's port; cost accepted: a second process to deploy (G2). |
| D2 | **Every request is verified with HMAC-SHA256 over the raw body; the secret is Secret Manager resource `carrier-webhook-secret` (INFRA-1) in new file `infra/secrets.tf`** | Q2 option a. Follows the existing pattern of Terraform-declared secrets (`infra/main.tf:1-7`); header name and encoding are the carrier's (G1). |
| D3 | **Verified events go onto a `bullmq` queue (INTEGRATION-1) on the existing Redis; a worker (INTEGRATION-2) drains it and calls `setStatus`** | Q3 option a. Redis `shipment-tracker-cache` already exists (`infra/main.tf:9-12`); cost accepted: bullmq requires `noeviction` (G3, D15). |
| D4 | **A body larger than the limit is rejected with 413 before its signature is checked** | Q4 option a. The limit's value is D9. |
| D5 | **The worker drops an event whose carrier event id it has already processed** | Q5 option b. The record of processed ids is D7. |
| D6 | **The worker runs inside the API server process, started from `src/server.ts`** | Assistant-taken, following from Q3 a: status lives in an in-process `Map` (`src/shipments.ts:10`), so a worker elsewhere would update a copy the API never reads. Flips if the store moves out of process (section 10). |
| D7 | **Processed event ids are Redis keys `carrier-event:<eventId>`, written after the event is applied, with a 7-day TTL; worker concurrency is 1** | Assistant-taken, following from Q5 b. The 7 days has no basis beyond exceeding a redelivery window nobody has documented (TRK-41); concurrency 1 keeps check-then-write race-free. |
| D8 | **The listener's queue connection sets `enableOfflineQueue: false`, so a failed enqueue answers 503 at once** | Assistant-taken, following from accepted risk 1: by default `Queue.add` waits for reconnection instead of failing. Cost accepted: Redis must be up when the listener starts, so a listener started during an outage exits and the carrier sees connection refused. |
| D9 | **The body limit is 256 KiB (262 144 bytes)** | Assistant-taken, following from Q4 a. No basis: the carrier's payload size is undocumented, so the value is a placeholder until G1 closes. |
| D10 | **Listener contract: `POST /carrier-events` on `WEBHOOK_PORT` (default 8081); 200 enqueued, 400 unparseable verified body, 401 missing or bad signature, 404 any other method or path, 413 over the limit, 503 enqueue failed** | Assistant-taken, following from D1, D4 and accepted risk 1. 8081 is the API's default 8080 (`src/server.ts:4`) plus one; 404 for the rest mirrors `src/server.ts:14`. |
| D11 | **Configuration comes from environment variables `WEBHOOK_PORT`, `CARRIER_WEBHOOK_SECRET` and `REDIS_URL` (CONFIG-1)** | Assistant-taken, following from D1–D3, mirroring `PORT` (`src/server.ts:4`). How the secret value reaches the variable is G2. |
| D12 | **The worker resolves the shipment by carrier tracking id through a new `findByCarrierTrackingId` in `src/shipments.ts`; an unmapped carrier status or unknown shipment completes the job without a change** | Assistant-taken, following from Q3 a: `setStatus` takes our id (`src/shipments.ts:16`) and a carrier knows its own tracking id (`src/shipments.ts:5`), an inference until G1 closes. |
| D13 | **Two ADRs land in phase 1: 0002 for the listener process (DOCS-1), 0003 for the bullmq queue (DOCS-2)** | Assistant-taken, following from ADR 0001 and `docs/CLAUDE.md:5-6`, which give a new process and a queue each its own record. That file makes writing them the user's call (closing question 8). |
| D14 | **`bullmq` is pinned at `6.4.2`** | Assistant-taken: latest on npm on 2026-10-24; its optional `ioredis >=5.0.0` peer accepts the pinned `5.4.1` (`package.json:9`). |
| D15 | **If G3 closes with any policy other than `noeviction`, INFRA-2 sets it on `shipment-tracker-cache` in phase 1, and phase 2 does not deploy before that applies** | Assistant-taken, following from D3: bullmq calls `noeviction` the only setting that guarantees correct queues. Needs consent for a protected edit, and changes eviction for every user of the instance. |

**Risks accepted**

| Risk | Cost if it lands | Mitigation |
|---|---|---|
| While Redis is down the listener answers 503 and relies on carrier redelivery | Events the carrier stops redelivering are lost, and their shipments keep a stale status | None in scope; the redelivery schedule is G4 (TRK-41). |

## 4. Target architecture

```
carrier ──POST /carrier-events──▶ API-1 listener (WEBHOOK_PORT)
                                   │ size cap → HMAC → parse → Queue.add
                                   ▼
                       INTEGRATION-1 queue "carrier-events" (Redis shipment-tracker-cache)
                                   ▼
                       INTEGRATION-2 worker, inside src/server.ts process
                                   │ dedup key → map status → findByCarrierTrackingId → setStatus
                                   ▼
                       in-process Map (src/shipments.ts:10) ──▶ GET /shipments/:id
```

**INFRA-1 — signing secret** (`infra/secrets.tf`, new; mirrors `infra/main.tf:1-7`):

```hcl
resource "google_secret_manager_secret" "carrier_webhook_secret" {
  secret_id = "carrier-webhook-secret"

  replication {
    auto {}
  }
}
```

The secret version (the shared value) is added outside Terraform by the carrier integrations team
(G5).

**INFRA-2 — eviction policy, conditional on D15** (`infra/main.tf:9-12`, changed):

```hcl
resource "google_redis_instance" "cache" {
  name           = "shipment-tracker-cache"
  memory_size_gb = 1
  redis_configs = {
    "maxmemory-policy" = "noeviction" # bullmq requires it; any other policy may evict queue keys
  }
}
```

**INTEGRATION-1 — queue** (`src/carrier-queue.ts`, new):

```ts
export const CARRIER_EVENTS_QUEUE = "carrier-events";

export interface CarrierEventJob {
  eventId: string;            // carrier event id — field name from G1
  carrierTrackingId: string;  // matches Shipment.carrierTrackingId (src/shipments.ts:5)
  carrierStatus: string;      // carrier vocabulary, mapped in INTEGRATION-2
  receivedAt: string;         // ISO-8601, set by the listener
}

// Producer side only (API-1). Fails fast instead of waiting for reconnection (D8);
// Redis must be reachable when this runs, or construction fails and the listener exits.
export function createCarrierEventsQueue(redisUrl: string): Queue<CarrierEventJob> {
  return new Queue(CARRIER_EVENTS_QUEUE, {
    connection: new IORedis(redisUrl, { enableOfflineQueue: false }),
  });
}
```

**INTEGRATION-2 — worker** (`src/carrier-worker.ts`, new; started from `src/server.ts`, D6). Its
connection keeps ioredis's offline queue, so it waits out a Redis outage instead of failing.

```ts
const DEDUP_TTL_SECONDS = 604_800; // 7 days, D7

export function startCarrierWorker(redisUrl: string): Worker<CarrierEventJob> {
  const redis = new IORedis(redisUrl);
  return new Worker<CarrierEventJob>(CARRIER_EVENTS_QUEUE, async (job) => {
    const key = `carrier-event:${job.data.eventId}`;
    if (await redis.exists(key)) return "duplicate";          // D5
    const status = mapCarrierStatus(job.data.carrierStatus);  // ShipmentStatus | null; table from G1
    const shipment = status && (await findByCarrierTrackingId(job.data.carrierTrackingId));
    if (shipment) await setStatus(shipment.id, status);       // D12: otherwise no change
    await redis.set(key, "1", "EX", DEDUP_TTL_SECONDS);       // written after apply, D7
  }, { connection: redis, concurrency: 1 });
}
```

`findByCarrierTrackingId(carrierTrackingId: string): Promise<Shipment | null>` is added to
`src/shipments.ts` and scans the `Map` for the first shipment whose `carrierTrackingId` matches.
`mapCarrierStatus` maps onto the four `ShipmentStatus` values (`src/shipments.ts:1`); its table is
blocked on G1.

**API-1 — listener** (`src/webhook-listener.ts`, new; own process, D1, D10):

1. Any request other than `POST /carrier-events` → 404.
2. `Content-Length` above 262 144 → 413 without reading the body; otherwise read the body as raw
   bytes, and abort with 413 as soon as the running total passes 262 144 (D4, D9). No signature work
   happens before this step completes.
3. Compute HMAC-SHA256 of the raw bytes with `CARRIER_WEBHOOK_SECRET`; compare with the signature
   header using `crypto.timingSafeEqual` after a length check. Missing, malformed or unequal → 401.
   Header name and encoding: G1.
4. Parse the verified bytes as JSON into `CarrierEventJob` fields; failure or a missing field → 400.
5. `queue.add("carrier-event", job)`; resolved → 200, rejected → 503 (D8, accepted risk 1).

**CONFIG-1 — environment** (read at startup; D11):

| Variable | Read by | Required | Default | Missing → |
|---|---|---|---|---|
| `WEBHOOK_PORT` | API-1 | no | `8081` | default used |
| `CARRIER_WEBHOOK_SECRET` | API-1 | yes | — | process exits non-zero |
| `REDIS_URL` | API-1, INTEGRATION-2 (API server) | yes | — | process exits non-zero |

The API server gains a hard dependency on `REDIS_URL` through INTEGRATION-2.

**DOCS-1 — ADR 0002** (`docs/adr/0002-carrier-webhook-listener.md`, new): records D1, D2 and D10, in
the format of ADR 0001.

**DOCS-2 — ADR 0003** (`docs/adr/0003-bullmq-carrier-event-queue.md`, new): records D3, D6, D7, D8,
D14 and accepted risk 1.

**TEST-1 — listener tests** (`src/webhook-listener.test.ts`, new, vitest): one case per D10 response;
the oversize case asserts the HMAC step never ran; the 503 case stubs `queue.add` to reject.

**TEST-2 — worker tests** (`src/carrier-worker.test.ts`, new, vitest): the same `eventId` twice calls
`setStatus` once; an unmapped status and an unknown tracking id call it never; the dedup key is
written in all three cases.

**Prerequisites**

| Prerequisite | Status |
|---|---|
| Redis instance reachable from both processes | Declared: `shipment-tracker-cache`, 1 GB (`infra/main.tf:9-12`); network reachability undeclared (G2). |
| Redis `maxmemory-policy noeviction` | Unknown: `infra/main.tf` sets no `redis_configs`, the Memorystore default was not established, and the live value was not read (G3). |
| `ioredis` compatible with bullmq 6.4.2 | Met: `5.4.1` pinned (`package.json:9`) against peer range `>=5.0.0`. |
| Secret value from the carrier | Not yet: G5. |
| Carrier webhook contract (signature header, payload fields, status vocabulary) | Unknown: G1. |

## 5. Ownership

| Repository / component | Owns | Apply mechanism |
|---|---|---|
| `shipment-tracker` `src/`, `package.json`, `docs/` | API-1, CONFIG-1, INTEGRATION-1, INTEGRATION-2, TEST-1, TEST-2, DOCS-1, DOCS-2 | Undeclared: the repository holds no CI configuration, start script or compute resource (G2). |
| `shipment-tracker` `infra/` | INFRA-1, INFRA-2 | Terraform; who runs the apply, and against which project, is undeclared (G2). Every change needs the consent recorded in section 1 (`CLAUDE.md:7-8`). |
| Carrier integrations team | Secret value (G5), webhook registration (section 10), carrier contract (G1), redelivery schedule (G4) | Outside this repository. |

Landing constraints: none beyond the consent rule; `infra/` changes land in the same pull request as
the phase 1 ADRs.

## 6. The change, per repository

### shipment-tracker

| # | Work item | Elements | Files | Kind | Phase | Lands as |
|---|---|---|---|---|---|---|
| W1 | Write ADR 0002 (listener process) | DOCS-1 | `docs/adr/0002-carrier-webhook-listener.md` | new | 1 | one PR |
| W2 | Write ADR 0003 (bullmq queue) | DOCS-2 | `docs/adr/0003-bullmq-carrier-event-queue.md` | new | 1 | one PR |
| W3 | Declare the signing secret | INFRA-1 | `infra/secrets.tf` | new | 1 | one PR |
| W4 | Set `noeviction` on the cache, only if G3 closes with another policy and question 10 grants consent | INFRA-2 | `infra/main.tf:9-12` | changed | 1 | one PR |
| W5 | Add `bullmq` `6.4.2` to `dependencies` | INTEGRATION-1 | `package.json:8-11` | changed | 2 | one PR |
| W6 | Queue name, job type, producer factory | INTEGRATION-1 | `src/carrier-queue.ts` | new | 2 | one PR |
| W7 | Add `findByCarrierTrackingId` after `setStatus` | INTEGRATION-2 | `src/shipments.ts:16-19` | changed | 2 | one PR |
| W8 | Worker with dedup and status mapping | INTEGRATION-2 | `src/carrier-worker.ts` | new | 2 | one PR |
| W9 | Start the worker from the API server with `REDIS_URL` | INTEGRATION-2, CONFIG-1 | `src/server.ts:1-4`, `src/server.ts:17` | changed | 2 | one PR |
| W10 | Worker tests | TEST-2 | `src/carrier-worker.test.ts` | new | 2 | one PR |
| W11 | Listener process | API-1, CONFIG-1 | `src/webhook-listener.ts` | new | 3 | one PR |
| W12 | Listener tests | TEST-1 | `src/webhook-listener.test.ts` | new | 3 | one PR |

## 7. Rollout

| # | Phase | Where | Switches anything? | Gate after? |
|---|---|---|---|---|
| 1 | Groundwork: W1, W2, W3, W4 | `docs/`, `infra/` | No — an empty secret, and an eviction change only under D15 | **Yes** — Terraform applied (G2), secret version added (G5), G3 closed and INFRA-2 applied if D15 fires |
| 2 | Queue and worker: W5–W10 | `src/`, `package.json` | No — the worker drains a queue nothing writes to yet; the API server now needs Redis to start | No |
| 3 | Listener: W11, W12; after phase 2 | `src/` | Yes, once deployed and registered with the carrier | **Yes** — final; listener deployed (G2), then webhook registered (section 10) |

Two landing units: phase 1, then phases 2–3 stacked on it.

**Orderings.** Phase 1 must be **merged** before phases 2–3 (ADR 0001 requires the record before
dependent work lands). INFRA-1 must be **applied with a version** before API-1 **deploys**, which
needs `CARRIER_WEBHOOK_SECRET`. Under D15, INFRA-2 must be **applied** before phase 2 **deploys**.
W11 imports W6, a **merge** ordering inside one unit. The API server (phase 2) should be **deployed**
before the webhook is registered, though queued events wait for it either way.

**Environments.** The repository declares none, so the order across environments and any waiting
period are G2; this spec sets no bake period.

**Hard dependencies outside this spec:** G1 closed before phase 2 merges (status table, payload
fields) and before phase 3 merges (signature header); G5 before phase 3 deploys.

**Rollback**

| Phase | Reversal | Complete when |
|---|---|---|
| 1 | Revert the PR and re-apply Terraform; INFRA-2 reverts to the prior policy | `gcloud secrets describe carrier-webhook-secret` returns NOT_FOUND and the policy reads as before |
| 2 | Revert the PR and redeploy the API server | The API server starts without `REDIS_URL`; leftover `carrier-event:*` keys expire within 7 days |
| 3 | Deregister the webhook with the carrier, stop the listener, revert the PR | No listener process runs; events already queued are applied by the worker or lost with the queue |

## 8. Verification

| Element | Check | Where it runs | Before the change | After |
|---|---|---|---|---|
| DOCS-1, DOCS-2 | Probe: `ls docs/adr/` | Branch, phase 1 | `0001-record-decisions.md` only | Also `0002-carrier-webhook-listener.md`, `0003-bullmq-carrier-event-queue.md` |
| INFRA-1 | Probe: `gcloud secrets describe carrier-webhook-secret --project=<G2>` | Deployed project, after phase 1 apply | NOT_FOUND | Resource returned; `gcloud secrets versions list` shows one enabled version (G5) |
| INFRA-2 | Probe: `gcloud redis instances describe shipment-tracker-cache --region=<G2> --format='value(redisConfigs)'` | Deployed project, after phase 1 apply | The value that closes G3 | `maxmemory-policy=noeviction` |
| INTEGRATION-1, INTEGRATION-2 | Probe: `npm test` runs TEST-2 | Branch, phase 2 | No test files; vitest reports none found | TEST-2 cases pass |
| API-1, CONFIG-1 | Probe: `npm test` runs TEST-1; listener started without `CARRIER_WEBHOOK_SECRET` exits non-zero | Branch, phase 3 | `src/webhook-listener.ts` absent | TEST-1 cases pass; exit code non-zero |
| API-1, INTEGRATION-1, INTEGRATION-2 | Triggered: POST a body signed with the deployed secret to the listener, then `GET /shipments/:id` for a shipment with that tracking id | Deployed environment, after phase 3 | Connection refused on the listener port | 200 from the listener; the GET returns the mapped status |
| API-1 (accepted risk 1) | Observed only: listener logs a 503 during a Redis outage and later a 200 for the same event id; observation, not a test | Deployed environment, during the first Redis outage | — | Duration unknown until TRK-41 (G4) |

TEST-1 and TEST-2 are verified by their own runs above. Every phase has a row.

## 9. Cleanup

None: nothing is removed or replaced.

## 10. Out of scope

| Item | Owner | Placement |
|---|---|---|
| Registering the listener URL with the carrier (surfaced during analysis) | Carrier integrations team | Gate after phase 3 deploy; ticket number to be filed (question 12) |
| Moving shipment status out of the in-process `Map` (surfaced during analysis: status is lost on restart and pins D6) | `shipment-tracker` team | Ticket number to be filed (question 12) |

## 11. Tickets

Existing: TRK-41 (carrier redelivery schedule, from the closing notes). The tracker was not
reachable from this session, so no other existing ticket was checked and none is claimed new; G1,
G5 and both section 10 items need numbers (question 12).

## Declared gaps

| # | Gap | Owner | Placement |
|---|---|---|---|
| G1 | Carrier webhook contract: signature header name and encoding, event id and tracking id fields, status vocabulary, payload size | Carrier integrations team | Blocks merge of phase 2 (`mapCarrierStatus`, `CarrierEventJob`) and phase 3 (signature header); D9 is revisited when it closes |
| G2 | How the service is deployed: compute, environments and their order, who applies `infra/`, how `CARRIER_WEBHOOK_SECRET` reaches the process, network path from carrier to listener | `shipment-tracker` team | Gate after phase 1 (apply) and gate after phase 3 (deploy) |
| G3 | Live `maxmemory-policy` of `shipment-tracker-cache`; the Memorystore default was not established | `shipment-tracker` team, with `gcloud` access | Gate after phase 1; decides D15 |
| G4 | Carrier redelivery schedule for unanswered webhooks | Carrier integrations team | TRK-41; sizes accepted risk 1 and D7's TTL |
| G5 | Secret version holding the shared signing value | Carrier integrations team | Gate after phase 1; blocks phase 3 deploy |

## 12. Appendix — the evidence record

Session research reports sit in `out.session/research/` (uncommitted); each row also names the
source a reader elsewhere can open.

| Claim | How it was verified |
|---|---|
| The API server answers only `GET /shipments/:id`, 404 otherwise | `src/server.ts:6-15`; `out.session/research/current-intake.md` "Intake". |
| `setStatus` has no caller | `out.session/research/current-intake.md` "Intake" (read of `src/` whole); `src/shipments.ts:16`. |
| Status is held in an in-process `Map` | `src/shipments.ts:10`: `const shipments = new Map<string, Shipment>();`. |
| `setStatus` takes the shipment id and no-ops for an unknown id | `src/shipments.ts:16-18`. |
| Shipments carry `carrierTrackingId`; four status values exist | `src/shipments.ts:5`, `src/shipments.ts:1`. |
| A carrier event identifies the shipment by the carrier's tracking id (D12) | Inference: no carrier contract was read; confirmed or overturned when G1 closes. |
| The API's port defaults to 8080 via `PORT` | `src/server.ts:4`. |
| Secrets are Terraform-declared Secret Manager resources, one exists | `infra/main.tf:1-7`; `out.session/research/current-intake.md` "Secrets and Redis". |
| One Redis instance, `shipment-tracker-cache`, with no `redis_configs` | `infra/main.tf:9-12`. |
| `ioredis` 5.4.1 is a dependency; `bullmq` is not | `package.json:9-10`. |
| `bullmq` latest is 6.4.2 with optional peer `ioredis >=5.0.0` | https://registry.npmjs.org/bullmq/latest (2026-10-24); `out.session/research/bullmq-redis.md` section 1. |
| bullmq requires `maxmemory-policy noeviction` | bullmq `docs/gitbook/guide/going-to-production.md`, "Max memory policy": "the only setting that guarantees the correct behavior of the queues"; `out.session/research/bullmq-redis.md` section 2. |
| Memorystore's default eviction policy | Not established: cloud.google.com unreachable from the session (`out.session/research/bullmq-redis.md` 3a); declared as G3. |
| `redis_configs` accepts Redis config parameters | terraform-provider-google `website/docs/r/redis_instance.html.markdown` (v8.8.1); `out.session/research/bullmq-redis.md` 3b. |
| `Queue.add` waits for reconnection by default; `enableOfflineQueue: false` makes it throw | bullmq `docs/gitbook/patterns/failing-fast-when-redis-is-down.md`; `out.session/research/bullmq-redis.md` section 5. |
| With `enableOfflineQueue: false`, Redis must be online when the `Queue` is created | bullmq `going-to-production.md`, "enableOfflineQueue": "the Redis instance must at least be online while the queue is being instantiated". |
| Workers should keep the offline queue | Same heading: "leave it as is for `Worker` instances". |
| `infra/` is protected; consent must be recorded in the spec | `CLAUDE.md:7-8`. |
| A new process and a queue each need an ADR; writing one is the user's call | `docs/CLAUDE.md:5-6`; `docs/adr/0001-record-decisions.md:5-6`. |
| ADR 0001 is accepted and the only record | `docs/adr/0001-record-decisions.md:3`; `out.session/research/current-intake.md` "Repository rules". |
| The repository declares no compute, CI or environments | Read of the whole tree at `ccba667` (10 tracked files, none a CI or compute definition); declared as G2. |
| `npm test` runs vitest and picks up `src/*.test.ts` | `package.json:6` for the script; the default include pattern is recalled, not read this session — confirmed when phase 2's `npm test` lists TEST-2. |
| Body limit 256 KiB (D9), port 8081 (D10), TTL 7 days (D7) | No basis beyond the rationales in section 3; assistant-chosen values awaiting ratification. |
| Redelivery schedule undocumented | Closing notes, "Left for later" 1; TRK-41. |
