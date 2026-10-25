# Carrier tracking webhooks

Carrier tracking events reach `shipment-tracker` through a signed webhook, a dedicated listener
process and a Redis-backed queue whose worker updates shipment status.

- Repository: `shipment-tracker`, at commit `1748e03`
- Epic / ticket: none identified (G6)
- Status: draft, awaiting validation
- Date: 2026-10-25
- Companion documents: [repository rules](../CLAUDE.md), [docs rules](../docs/CLAUDE.md),
  [ADR 0001](../docs/adr/0001-record-decisions.md), [evidence quotes](evidence/appendix.md)

**Precedence.** This spec supersedes no document and reverses no decision. The one decision record
in the repository, [ADR 0001](../docs/adr/0001-record-decisions.md) (accepted 2026-03-02), stays in
force: it requires every mechanism choice to be recorded as an ADR before dependent work lands
(`docs/adr/0001-record-decisions.md:5-6`), and D1 (a new process) and D3 (a queue and a library)
are such choices with no record yet — placed in section 10.

## 2. Problem and goal

Carrier status never reaches the service today: the API server answers only
`GET /shipments/:id` and 404 for everything else (`src/server.ts:6-15`), and `setStatus` is
exported with no caller (`src/shipments.ts:16`). The service's one Redis instance,
`shipment-tracker-cache` (`infra/main.tf:9-12`), and the `ioredis` 5.4.1 dependency
(`package.json:9`) exist, but no queue library does.

**Goal:** every carrier tracking event whose signature verifies changes the matching shipment's
status exactly once, without the carrier's traffic sharing a process or port with the API server.

## 3. Design decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Webhooks are received by a new listener process, separate from `src/server.ts`, on its own port.** | Q1 option b. Flips if the carrier traffic may share the API server's process and port (`src/server.ts:4`). |
| D2 | **Every request is verified with HMAC-SHA256 over the raw body; the shared secret is a new Secret Manager secret `carrier-webhook-secret`, declared in a new file `infra/secrets.tf`.** | Q2 option a; secrets already live in Secret Manager via Terraform (`infra/main.tf:1-7`). `infra/` is protected (`CLAUDE.md:7-8`): consent to create `infra/secrets.tf` is recorded here as the user's Q2 a choice, which names the file, and the closing "Confirmed — write it up." |
| D3 | **Verified events go onto a `bullmq` queue on the existing Redis instance; a worker drains it and calls `setStatus`.** | Q3 option a; reuses `shipment-tracker-cache` (`infra/main.tf:9-12`). Cost accepted: bullmq needs `maxmemory-policy` `noeviction` on an instance named and used as a cache (G3). |
| D4 | **A body larger than the maximum size is rejected with 413 before its signature is checked.** | Q4 option a. Bounds the work an unauthenticated caller can force; the value is D8. |
| D5 | **The worker drops an event whose carrier event id it has already processed.** | Q5 option b. The carrier may redeliver (R1, G1); the mechanism is D7. |
| D6 | **The worker runs inside the API server process, started from `src/server.ts`.** | assistant-taken, following from D3: shipments live in a process-local `Map` (`src/shipments.ts:10`), so a `setStatus` in any other process is invisible to `GET /shipments/:id`. Flips if the store moves to a shared database. |
| D7 | **Processed event ids are Redis keys `carrier-event:processed:<eventId>` with a 7-day TTL, checked before and written after `setStatus`; worker concurrency stays 1.** | assistant-taken, following from D5. Rule: the TTL must be at least the carrier's longest redelivery window (G1, TRK-41); 7 days has no basis beyond that rule and is replaced once TRK-41 answers. |
| D8 | **The maximum body size is 65536 bytes (64 KiB).** | assistant-taken, following from D4. The carrier's payload size is undocumented (G2); no evidence sets this value. |
| D9 | **The listener serves `POST /carrier/webhooks` on `WEBHOOK_PORT`, default 8081; every other method or path gets 404.** | assistant-taken, following from D1. 8081 is the API server's default 8080 (`src/server.ts:4`) plus one; no other basis. |
| D10 | **Responses: 413 oversized, 401 missing or mismatched signature, 400 unparseable body, 503 enqueue failed, 202 enqueued.** | assistant-taken, following from D2–D4 and R1. 202 is sent only after the queue accepts the job, so an acknowledged event is in Redis. |
| D11 | **`bullmq` is pinned exactly at `6.4.2`.** | assistant-taken, following from D3: latest stable on 2026-10-25, its optional `ioredis` peer range `>=5.0.0` admits the pinned 5.4.1 (evidence/appendix.md E2). Exact pins follow `package.json:9-10`. |
| D12 | **The worker resolves the shipment through a new `findByCarrierTrackingId`; an event for an unknown tracking id or an unmapped carrier status is logged and dropped.** | assistant-taken, following from D3: `setStatus` takes the shipment id (`src/shipments.ts:16`), while a shipment's carrier id is the `carrierTrackingId` field (`src/shipments.ts:5`). |
| D13 | **Configuration comes from environment variables `REDIS_URL`, `CARRIER_WEBHOOK_SECRET`, `WEBHOOK_PORT`; the listener exits at startup when `CARRIER_WEBHOOK_SECRET` or `REDIS_URL` is unset.** | assistant-taken, following from D2 and D3: the code holds no Redis connection or secret read today (`src/server.ts:1-4`). How the deployment injects them is G4. |
| D14 | **Queue jobs use `removeOnComplete: true` and `removeOnFail: true`; a failed job is logged.** | assistant-taken, following from D3 and D7: under `noeviction` retained jobs only grow, and dedup is D7's key, not the job id. |

**Risks accepted**

| # | Risk | Cost if it lands | Mitigation |
|---|---|---|---|
| R1 | While Redis is down the listener answers 503 and relies on the carrier to redeliver. | Events the carrier gives up on are lost, and those shipments keep a stale status. | The carrier's redelivery (schedule unknown, G1); 503 never acknowledges an event that was not stored (D10). |

## 4. Target architecture

**INFRA-1 — signing secret** (`infra/secrets.tf`, new). The secret value is not in Terraform (G5).

```hcl
resource "google_secret_manager_secret" "carrier_webhook_secret" {
  secret_id = "carrier-webhook-secret"

  replication {
    auto {}
  }
}
```

**API-1 — webhook listener** (`src/webhook-listener.ts`, new entrypoint, its own process).

```ts
const PORT = Number(process.env.WEBHOOK_PORT ?? 8081);   // D9
const MAX_BODY_BYTES = 65536;                              // D8
const SECRET = requireEnv("CARRIER_WEBHOOK_SECRET");      // D13: exit(1) when unset

http.createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/carrier/webhooks") return res.writeHead(404).end();
  // 1. Read the raw body as a Buffer. A content-length above MAX_BODY_BYTES, or more than
  //    MAX_BODY_BYTES bytes received, answers 413 and stops reading — before any HMAC work (D4).
  // 2. expected = HMAC-SHA256(SECRET, rawBody); compare with crypto.timingSafeEqual against the
  //    carrier's signature header (name and encoding: G2). Missing, wrong length or mismatch → 401.
  // 3. Parse the raw body into CarrierEvent (field names: G2). Failure → 400.
  // 4. await carrierEvents.add("carrier-event", event). Rejection → 503 (R1). Success → 202.
}).listen(PORT);
```

The HMAC runs over the bytes as received, never over re-serialised JSON — a re-serialised body
verifies nothing the carrier signed.

**INTEGRATION-1 — `carrier-events` queue** (`src/queue.ts`, new).

```ts
export interface CarrierEvent {
  eventId: string;            // carrier event id, D7's dedup key
  carrierTrackingId: string;  // matches Shipment.carrierTrackingId
  carrierStatus: string;      // carrier vocabulary, mapped by INTEGRATION-2
}
export const connection = new IORedis(requireEnv("REDIS_URL"));   // D13
export const carrierEvents = new Queue<CarrierEvent>("carrier-events", {
  connection,
  defaultJobOptions: { removeOnComplete: true, removeOnFail: true },   // D14
});
```

**INTEGRATION-2 — status worker** (`src/worker.ts`, new; started from `src/server.ts`, D6).

```ts
new Worker<CarrierEvent>("carrier-events", async (job) => {
  const { eventId, carrierTrackingId, carrierStatus } = job.data;
  const key = `carrier-event:processed:${eventId}`;
  if (await connection.exists(key)) return log("dropped", eventId, "duplicate");        // D5
  const status = mapCarrierStatus(carrierStatus);           // returns null when unmapped (G2)
  const shipment = await findByCarrierTrackingId(carrierTrackingId);                   // API-2
  if (!status || !shipment) return log("dropped", eventId, status ? "unknown-shipment" : "unmapped-status");
  await setStatus(shipment.id, status);
  await connection.set(key, "1", "EX", 604800);              // D7: 7 days, written after setStatus
}, { connection, concurrency: 1 });                          // concurrency 1 keeps check-then-set race-free
```

**DB-1 — processed-event keys** in `shipment-tracker-cache`: key `carrier-event:processed:<eventId>`,
value `"1"`, TTL 604800 seconds (D7). Only INTEGRATION-2 reads or writes them.

**API-2 — `findByCarrierTrackingId(carrierTrackingId: string): Promise<Shipment | null>`** in
`src/shipments.ts`, new: returns the first shipment in the store whose `carrierTrackingId` equals the
argument, else `null`.

**CONFIG-1 — `bullmq` dependency**: `"bullmq": "6.4.2"` in `package.json` `dependencies` (D11).

**CONFIG-2 — environment variables**: `REDIS_URL` (listener and API server), `CARRIER_WEBHOOK_SECRET`
(listener; the value of INFRA-1), `WEBHOOK_PORT` (listener, default 8081) (D13).

**TEST-1 — tests** under vitest (`package.json:6`): `src/webhook-listener.test.ts` and
`src/worker.test.ts`, with the queue and Redis client replaced by in-memory fakes.

**Prerequisites**

| Prerequisite | Status |
|---|---|
| Redis instance for the queue | Exists — `shipment-tracker-cache`, 1 GB (`infra/main.tf:9-12`). |
| Redis `maxmemory-policy` is `noeviction` | Unknown — `infra/main.tf` sets no `redis_configs`, and the live value was not read (G3). |
| Carrier payload and signature contract | Unknown — G2. |
| Secret value shared with the carrier | Does not exist — G5. |
| Deployment of a second process with its own port and public route | Unknown — the repository holds no deployment configuration (G4). |

## 5. Ownership

| Repository / component | Owns | Apply mechanism |
|---|---|---|
| `shipment-tracker` — `src/`, `package.json` | API-1, API-2, INTEGRATION-1, INTEGRATION-2, DB-1, CONFIG-1, CONFIG-2, TEST-1 | Pull request; the build and deploy path is undeclared in the repository (G4). |
| `shipment-tracker` — `infra/` | INFRA-1 | Protected path (`CLAUDE.md:7-8`); Terraform apply, by a runner the repository does not name (G4). |
| Carrier integrations team | The carrier's webhook registration, the secret value, the payload contract | Outside this repository (G2, G5). |

Every change under `infra/` needs the user's explicit consent recorded in the spec or task
(`CLAUDE.md:7-8`); INFRA-1's consent is recorded in D2. The repository holds no CI configuration,
so no check gates a merge beyond `npm test` (`package.json:6`). Landing constraint: INFRA-1 lands as
its own pull request, because its apply and secret value (G5) must exist in an environment before
the listener deploys there.

## 6. The change, per repository

### shipment-tracker

| # | Work item | Elements | Files | Kind | Phase | Lands as |
|---|---|---|---|---|---|---|
| 1 | Declare the `carrier-webhook-secret` Secret Manager secret, shaped like `database_url` (`infra/main.tf:1-7`). | INFRA-1 | `infra/secrets.tf` | new | 1 | one PR |
| 2 | Add `"bullmq": "6.4.2"` to `dependencies`. | CONFIG-1 | `package.json:8-11` | changed | 2 | one PR |
| 3 | Add `findByCarrierTrackingId` after `getShipment`. | API-2 | `src/shipments.ts:12-14` | changed | 2 | one PR |
| 4 | Create the Redis connection and the `carrier-events` queue with `CarrierEvent`. | INTEGRATION-1, CONFIG-2 | `src/queue.ts` | new | 2 | one PR |
| 5 | Create the listener entrypoint: route, size limit, HMAC check, enqueue, responses. | API-1, CONFIG-2 | `src/webhook-listener.ts` | new | 2 | one PR |
| 6 | Create the worker with dedup keys, status mapping and drop logging. | INTEGRATION-2, DB-1 | `src/worker.ts` | new | 2 | one PR |
| 7 | Start the worker in the API server process beside `server.listen`. | INTEGRATION-2 | `src/server.ts:1-2`, `src/server.ts:17` | changed | 2 | one PR |
| 8 | Test listener responses (404, 413 before HMAC, 401, 400, 503, 202) and worker paths (apply, duplicate, unknown shipment, unmapped status). | TEST-1 | `src/webhook-listener.test.ts`, `src/worker.test.ts` | new | 2 | one PR |

## 7. Rollout

| # | Phase | Where | Switches anything? | Gate after? |
|---|---|---|---|---|
| 1 | Secret resource (item 1) | `infra/` | No — an empty secret nothing reads. | Yes — applied, and a secret version added (G5), in an environment before phase 2 **deploys** there. |
| 2 | Listener, queue, worker, tests (items 2–8) | `src/`, `package.json` | No — no carrier sends traffic until phase 3. Merge blocked by G2; deploy blocked by G3 and G4. | Yes — deployed, with the triggered checks in section 8 passing, before phase 3. |
| 3 | Carrier registers the listener's public URL and the shared secret | Carrier side, no work item here | Yes — real events start changing shipment status. | Final phase. |

Estimated size: phase 1 one file under 10 lines; phase 2 eight files, roughly 400 changed lines,
lockfile excluded.

**Environments.** The repository declares none (G4, G7); each environment runs phase 1's gate, then
phase 2, before phase 3 is requested for it.

**Hard dependencies.** TRK-41 (carrier redelivery schedule) does not block a merge; it replaces D7's
TTL. G2 blocks the phase 2 merge; G3, G4 and G5 block the phase 2 deploy.

**Rollback.**

| Phase | Reversal | Complete when |
|---|---|---|
| 2 | Revert the phase 2 deploy and stop the listener process. | Nothing listens on `WEBHOOK_PORT`; the API server starts no worker. Statuses already set stay set. |
| 3 | Carrier removes the webhook registration. | The carrier sends no further requests; queued jobs drain or are discarded with the queue. |

## 8. Verification

| Element | Check | Where it runs | Before the change | After |
|---|---|---|---|---|
| INFRA-1 | Probe: `terraform plan` | Branch | No `google_secret_manager_secret.carrier_webhook_secret` in the plan. | Plan shows 1 to add, that resource. |
| INFRA-1 | Probe: `gcloud secrets versions list carrier-webhook-secret` | Each deployed environment | `NOT_FOUND`. | One enabled version. |
| CONFIG-1 | Probe: `npm ls bullmq` | Branch | `(empty)`. | `bullmq@6.4.2`. |
| API-1, CONFIG-2 | Probe: `npm test` — listener cases of item 8, plus exit at startup without `CARRIER_WEBHOOK_SECRET` | Branch | Test files absent. | All pass; the 413 case asserts the HMAC function was not called. |
| API-2, INTEGRATION-1, INTEGRATION-2, DB-1, TEST-1 | Probe: `npm test` — worker cases of item 8 | Branch | Test files absent. | All pass; the duplicate case asserts `setStatus` was not called. |
| Phase 1 gate (G3) | Probe: `gcloud redis instances describe shipment-tracker-cache --format='value(redisConfigs)'` | Each deployed environment | Unknown (G3). | `maxmemory-policy=noeviction` before phase 2 deploys. |
| API-1, INTEGRATION-2, DB-1 | Triggered: post a body signed with the environment's secret for a known shipment, then repeat it | Deployed environment, before phase 3 | `GET /shipments/:id` shows the old status. | First post 202 and status changes; second post 202, logged `dropped … duplicate`. |
| Phase 3, R1 | Observed only: listener 202/503 counts and worker drop logs over the first 7 days of carrier traffic | Production | No carrier traffic. | Observation, not a test: a 503 with no later 202 for the same event id is a lost event. |

Every element has a row.

## 9. Cleanup

None: the change deletes nothing.

## 10. Out of scope

| Item | Owner | Placement |
|---|---|---|
| ADRs for D1 (a new process) and D3 (bullmq queue) — surfaced during analysis; ADR 0001 requires them before dependent work lands (`docs/adr/0001-record-decisions.md:5-6`). | The user decides whether to write them (`docs/CLAUDE.md:5-6`). | Before the phase 2 merge, if written. |
| Setting `maxmemory-policy` to `noeviction` on `shipment-tracker-cache` — surfaced during analysis; an edit to protected `infra/main.tf:9-12`. | The user (consent per `CLAUDE.md:7-8`). | Needed only if G3's probe returns another policy; the phase 2 deploy waits for it. |
| Moving the shipment store off the process-local `Map` (`src/shipments.ts:10`). | The spec's team. | No ticket; D6 is what flips if it moves. |

## 11. Tickets

Existing: TRK-41 — carrier redelivery schedule, owner carrier integrations team. The tracker was not
searched for an epic or further tickets (G6); no ticket is created by this spec.

## Declared gaps

| # | Gap | Owner | Placement |
|---|---|---|---|
| G1 | The carrier's redelivery schedule for unanswered webhooks is undocumented. | Carrier integrations team | TRK-41; replaces D7's TTL, bounds R1. |
| G2 | The carrier's payload contract: signature header name and encoding, event id and tracking id fields, status vocabulary, payload size. | Carrier integrations team | Blocks the phase 2 merge; no ticket identified (G6). |
| G3 | The live `maxmemory-policy` of `shipment-tracker-cache` is unread; bullmq requires `noeviction` (evidence/appendix.md E1). | The spec's team | Section 8 probe, before phase 2 deploys in each environment. |
| G4 | How a second process, its port, a public route and the CONFIG-2 variables are deployed, and who runs Terraform apply: the repository declares none of it. | The spec's team | Blocks the phase 2 deploy. |
| G5 | Who generates the shared secret value and adds it as INFRA-1's version. | Carrier integrations team | Phase 1 gate. |
| G6 | The tracker was not searched for an epic or tickets covering G2 and this work. | The spec's team | Before task split. |
| G7 | The list of deployed environments and their order. | The spec's team | Before phase 1 applies. |

## 12. Appendix — the evidence record

Session folder (uncommitted, this machine only): `out.session/`.

| Claim | How it was verified |
|---|---|
| The API server answers only `GET /shipments/:id`, 404 otherwise. | `src/server.ts:6-15`, read 2026-10-25; `out.session/research/current-intake.md` "Intake". |
| `setStatus` has no caller and takes a shipment id. | `src/shipments.ts:16`; no-caller claim from `out.session/research/current-intake.md` "Intake" (read of `src/` whole). |
| Shipments live in a process-local `Map`. | `src/shipments.ts:10`. |
| Shipments carry `carrierTrackingId`. | `src/shipments.ts:5`. |
| The API server defaults to port 8080. | `src/server.ts:4`. |
| Secrets are Secret Manager resources in Terraform. | `infra/main.tf:1-7`; `out.session/research/current-intake.md` "Secrets and Redis". |
| One Redis instance, `shipment-tracker-cache`, 1 GB, no `redis_configs`. | `infra/main.tf:9-12`. |
| `ioredis` 5.4.1 is a dependency; `bullmq` is not; versions are pinned exactly. | `package.json:8-11`. |
| `infra/` is protected and needs recorded consent. | `CLAUDE.md:7-8`. |
| A mechanism choice needs an ADR and writing one is the user's call. | `docs/CLAUDE.md:5-6`; `docs/adr/0001-record-decisions.md:5-6`. |
| bullmq requires `maxmemory-policy` `noeviction`. | docs.bullmq.io/guide/going-to-production "Max memory policy", quoted in evidence/appendix.md E1; `out.session/research/bullmq-redis.md` section 2. |
| bullmq 6.4.2 is latest, with optional peer `ioredis >=5.0.0`. | registry.npmjs.org/bullmq/latest and the 6.4.2 tarball's `package.json`, evidence/appendix.md E2; `out.session/research/bullmq-redis.md` section 1. |
| Memorystore's `maxmemory-policy` is settable via Terraform `redis_configs`; its default is unknown. | Google Redis Admin API client and Terraform registry, evidence/appendix.md E3. The default was not reached (cloud.google.com blocked), so no claim is made. |
| Tests run under vitest; no CI config exists. | `package.json:6`; repository file list at `1748e03` holds no CI directory. |
| 64 KiB, port 8081, 7-day TTL. | No evidence: assistant-taken values (D7–D9), each awaiting ratification. |
| Phase 2 size estimate (~400 lines). | Inference from the item 2–8 sketches in section 4; not measured. |
