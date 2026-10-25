# Carrier tracking webhooks

## 1. Header and precedence

Carrier tracking events reach `setStatus` through a signed webhook listener and a Redis-backed queue.

- **Repository:** `shipment-tracker`, written against commit `729b5e7`
- **Ticket:** no epic identified; related ticket TRK-41 (section 11)
- **Status:** draft — written 2026-10-25 from the design session of 2026-10-20
- **Companion documents:** [ADR-0001 — Record architecture decisions](../docs/adr/0001-record-decisions.md)

**Precedence.** This spec supersedes nothing: no earlier design note covers carrier intake, and
`docs/adr/` holds one record, ADR-0001 (status: accepted, 2026-03-02), which this spec does not
reverse. ADR-0001 binds this spec: every mechanism choice is recorded as an ADR before the work that
depends on it lands.

## 2. Problem and goal

The service has no carrier intake. The API server answers only `GET /shipments/:id` and 404 for
everything else (`src/server.ts:6-15`), and `setStatus`, the only writer of shipment status
(`src/shipments.ts:16`), has no caller. Shipment status is held in a process-local `Map`
(`src/shipments.ts:10`), so it can be changed only from inside the process that serves it.

**Goal:** every carrier tracking event the carrier delivers with a valid signature changes the
status of its shipment exactly once.

**Secondary goal that shapes the structure:** carrier traffic never shares a process or a port with
the storefront-facing API (D1), so the listener is a separate process and the queue (D3) is the only
path between it and the store.

## 3. Design decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Carrier webhooks are received by a new listener process (API-1), separate from the API server in `src/server.ts`, on a dedicated port of its own.** | Q1, option b. The API server today serves only shipment reads (`src/server.ts:6-15`); cost accepted: a second process to deploy and run. |
| D2 | **Every webhook request is verified with an HMAC-SHA256 signature over the raw body; the shared secret is the new Secret Manager secret `carrier-webhook-secret` (INFRA-1) in a new file, `infra/secrets.tf`.** | Q2, option a. Secrets are Secret Manager resources declared in Terraform (`infra/main.tf:1-7`) and no signing secret exists; cost accepted: a change under the protected `infra/` path (section 5). |
| D3 | **Verified events go onto a queue built with `bullmq` on the existing Redis instance (INTEGRATION-1); a worker (INTEGRATION-2) drains it and calls `setStatus`.** | Q3, option a. One Redis instance already exists (`infra/main.tf:9-12`); cost accepted: a new dependency, `bullmq` is not one today (`package.json:8-11`). |
| D4 | **A request whose body is larger than the maximum size (D8) is rejected with 413 before its signature is checked.** | Q4, option a. Bounds the bytes the listener buffers and hashes for an unauthenticated caller. |
| D5 | **The worker drops an event whose carrier event id it has already processed.** | Q5, option b. Makes a carrier redelivery (risk R1, gap G1) harmless to status. |
| D6 | **The worker (INTEGRATION-2) runs inside the API server process, started from `src/server.ts`.** | assistant-taken, following from D3: status lives in a process-local `Map` (`src/shipments.ts:10`), so a worker in any other process would update a store nobody reads. Flips when the store moves out of process (section 10). |
| D7 | **API-1 accepts `POST /webhooks/carrier` and answers 202 on enqueue, 401 on a missing or invalid signature, 413 over size, 503 when the enqueue fails, 405 for another method on that path and 404 elsewhere.** | assistant-taken, following from D1, D2, D4 and risk R1, which fix the behaviours but not the path or codes. 202 states that status is applied asynchronously (D3). |
| D8 | **The maximum body size is 65,536 bytes, configurable as `WEBHOOK_MAX_BODY_BYTES`.** | assistant-taken, following from D4, which ratified the check but no value. No carrier payload size is known (gap G3); the value has no other basis. |
| D9 | **Deduplication (D5) uses a Redis key `carrier-event:<eventId>` on the same instance, checked before `setStatus` and written after it returns, expiring after 7 days.** | assistant-taken, following from D5, which named no store. The 7-day expiry is provisional: it must cover the carrier's redelivery window, which is gap G1. |
| D10 | **The queue is named `carrier-events`; `bullmq` is pinned to an exact version, the latest release at implementation time; the worker runs with concurrency 1 and default job options.** | assistant-taken, following from D3. Exact pins match `package.json:9-13`; concurrency 1 makes the check-then-write in D9 race-free. |
| D11 | **The worker resolves the shipment by the event's carrier tracking id through a new `findByCarrierTrackingId` in `src/shipments.ts`, and drops an event whose tracking id matches no shipment.** | assistant-taken, following from D3: `setStatus` takes the service's shipment id (`src/shipments.ts:16`) while a shipment records its `carrierTrackingId` (`src/shipments.ts:5`). Inference that the carrier sends its own tracking id, not ours; flips if gap G3 shows otherwise. |
| D12 | **Configuration is read from environment variables `CARRIER_WEBHOOK_SECRET`, `WEBHOOK_PORT` (default 8081), `WEBHOOK_MAX_BODY_BYTES` and `REDIS_URL` (CONFIG-1); the listener exits non-zero at start when the secret or `REDIS_URL` is unset.** | assistant-taken, following from D1 and D2. Mirrors the API server's `PORT` variable (`src/server.ts:4`); no Redis connection code exists today (no file under `src/` imports `ioredis`). |

**Risks accepted**

| # | Risk | Cost if it lands | Mitigation |
|---|---|---|---|
| R1 | While Redis is down the listener answers 503 and relies on the carrier to redeliver. | Events the carrier gives up on are lost, and their shipments keep a stale status. | Carrier redelivery, whose schedule is unknown (gap G1, TRK-41); D5 makes redeliveries safe to apply. |

## 4. Target architecture

### API-1 — webhook listener process

New file `src/webhook-listener.ts`, started as its own process; it never imports `src/server.ts`.

```ts
// POST /webhooks/carrier on WEBHOOK_PORT (D7, D12)
async function handle(req, res) {
  if (req.url !== "/webhooks/carrier") return res.writeHead(404).end();
  if (req.method !== "POST") return res.writeHead(405).end();
  // D4: size first, before any signature work.
  // Content-Length over the limit -> 413 without reading; otherwise count streamed bytes and
  // abort with 413 the moment the count passes the limit (Content-Length can be absent or wrong).
  const raw: Buffer | "too-large" = await readBounded(req, MAX_BODY_BYTES);
  if (raw === "too-large") return res.writeHead(413).end();
  // D2: HMAC-SHA256 over the raw bytes, never over re-serialised JSON.
  const expected = hmacSha256(CARRIER_WEBHOOK_SECRET, raw);
  const given = decodeSignature(req.headers[SIGNATURE_HEADER]);   // header name and encoding: gap G2
  if (!given || !timingSafeEqual(expected, given)) return res.writeHead(401).end();
  try {
    await carrierEvents.add("carrier-event", { body: raw.toString("utf8") });  // INTEGRATION-1
  } catch {
    return res.writeHead(503).end();   // R1: Redis down, carrier redelivers
  }
  res.writeHead(202).end();
}
```

The listener does not parse the body: an event that is signed but malformed is accepted with 202
and dropped by the worker (INTEGRATION-2), so parsing rules live in one place.

### INTEGRATION-1 — `carrier-events` queue

New file `src/carrier-queue.ts`, exporting the `bullmq` `Queue` named `carrier-events` (D10),
connected through `REDIS_URL`. Job data is `{ body: string }`, the raw signed body as UTF-8. Both
API-1 (producer) and INTEGRATION-2 (consumer) import it.

### INTEGRATION-2 — status worker

New file `src/carrier-worker.ts`; a `bullmq` `Worker` on `carrier-events` with concurrency 1,
started by `src/server.ts` (D6).

```ts
async function process(job) {
  const event = parseCarrierEvent(job.data.body);   // field names and status vocabulary: gap G3
  if (!event) return log("dropped: malformed");
  const key = `carrier-event:${event.eventId}`;
  if (await redis.exists(key)) return log("dropped: duplicate");          // D5, D9
  const shipment = await findByCarrierTrackingId(event.trackingId);         // D11
  if (!shipment) return log("dropped: unknown tracking id");
  await setStatus(shipment.id, mapStatus(event.status));                    // mapping: gap G3
  await redis.set(key, "1", "EX", 7 * 24 * 3600);                          // D9, written after success
}
```

`findByCarrierTrackingId(trackingId: string): Promise<Shipment | null>` is added to
`src/shipments.ts` beside `getShipment`. A carrier status with no mapping drops the event with a log
line rather than writing a wrong status.

### INFRA-1 — signing secret

New file `infra/secrets.tf` (protected path, section 5):

```hcl
resource "google_secret_manager_secret" "carrier_webhook_secret" {
  secret_id = "carrier-webhook-secret"   # D2; the value is a secret version added outside Terraform (gap G7)

  replication {
    auto {}                              # mirrors infra/main.tf:4-6
  }
}
```

### CONFIG-1 — dependency and configuration

`package.json` gains `bullmq` under `dependencies`, pinned exact (D10, version: gap G8). The
environment variables of D12; how each reaches the running processes is gap G4.

### TEST-1 — listener tests

New file `src/webhook-listener.test.ts` (vitest, `package.json:6`): 413 for a body over the limit
with an invalid signature (proves size is checked first), 401 for a bad or missing signature, 202
and one job for a valid one, 503 when the enqueue throws, 404 and 405 for the wrong path and method.

### TEST-2 — worker tests

New file `src/carrier-worker.test.ts`: a valid event calls `setStatus` once; the same event id twice
calls it once; malformed, unknown-tracking-id and unmapped-status events call it never.

### Prerequisites

| Prerequisite | Status |
|---|---|
| A Redis instance for the queue and deduplication keys | Exists — `shipment-tracker-cache`, 1 GB (`infra/main.tf:9-12`); its suitability for `bullmq` is gap G10. |
| Secret Manager declared in Terraform | In use — `shipment-tracker-database-url` (`infra/main.tf:1-7`). |
| Carrier signature scheme, payload schema and redelivery schedule | Not established — gaps G1, G2, G3. |
| Deployment of a second process with its own reachable port | Not established — no deployment configuration is in the repository (gap G4). |

## 5. Ownership

| Repository / component | Owns | Apply mechanism |
|---|---|---|
| `shipment-tracker` — `src/`, `package.json` | API-1, INTEGRATION-1, INTEGRATION-2, CONFIG-1, TEST-1, TEST-2 | Pull request; no CI or deploy configuration is in the repository (gap G4). |
| `shipment-tracker` — `infra/` | INFRA-1 | Terraform; no pipeline is in the repository and the apply mechanism is gap G5. |
| Carrier integrations team | Carrier-side contract, webhook URL registration, secret exchange | Outside this repository (gaps G1, G2, G3, G7). |

**Protected path.** `CLAUDE.md:7-8` forbids creating or editing a file under `infra/` without the
user's explicit consent, recorded in the spec or task that does it. Consent recorded for INFRA-1:
the user chose Q2 option a, whose text names the new file `infra/secrets.tf`; nothing else under
`infra/` is touched.

**Landing constraints.** None stated by the repository. INFRA-1 lands as its own pull request because
its apply must complete before API-1 deploys (section 7).

## 6. The change, per repository

### shipment-tracker

| # | Work item | Elements | Files | Kind | Phase | Lands as |
|---|---|---|---|---|---|---|
| W1 | Declare the `carrier-webhook-secret` Secret Manager secret | INFRA-1 | `infra/secrets.tf` (new) | new | 1 | one PR |
| W2 | Add `bullmq`, pinned exact | CONFIG-1 | `package.json:8-11` | changed | 2 | one PR |
| W3 | Create the `carrier-events` queue module | INTEGRATION-1 | `src/carrier-queue.ts` (new) | new | 2 | one PR |
| W4 | Add `findByCarrierTrackingId` beside `getShipment` | INTEGRATION-2 | `src/shipments.ts:12-14` | changed | 2 | one PR |
| W5 | Build the status worker and start it from the API server | INTEGRATION-2, CONFIG-1 | `src/carrier-worker.ts` (new), `src/server.ts:17` | new, changed | 2 | one PR |
| W6 | Write the worker tests | TEST-2 | `src/carrier-worker.test.ts` (new) | new | 2 | one PR |
| W7 | Build the webhook listener process | API-1, CONFIG-1 | `src/webhook-listener.ts` (new) | new | 3 | one PR |
| W8 | Write the listener tests | TEST-1 | `src/webhook-listener.test.ts` (new) | new | 3 | one PR |

W2–W8 share one pull request (phases 2 and 3 form one landing unit, section 7).

## 7. Rollout

| # | Phase | Where | Switches anything? | Gate after? |
|---|---|---|---|---|
| 1 | Signing secret: W1 | `infra/` | No — declares an unused secret | Yes — Terraform applied and a secret version added (G5, G7) in each environment before phase 3 deploys there |
| 2 | Queue and worker: W2–W6 | `src/`, `package.json` | No — the worker consumes a queue with no producer | No |
| 3 | Listener: W7, W8 | `src/` | Yes, once the carrier is pointed at the listener (G7) | Yes — final phase |

**Orderings.** The phase 1 gate is a **deploy** ordering: the secret must **exist with a version in
the environment** before API-1 deploys there, since API-1 exits at start without it (D12). Phase 2
before phase 3 is a development ordering inside one pull request; the worker should be **running in
the environment** before the carrier is pointed at the listener, though jobs enqueued earlier wait
in Redis rather than being lost.

**Environments.** No environments or promotion order are declared in the repository (gap G9), so no
waiting period is set.

**Hard dependencies outside this spec.** The carrier's signature scheme (G2) and payload schema (G3)
must be known before the phase 2–3 pull request merges; webhook URL registration and secret
exchange (G7) gate switching phase 3 on.

**Rollback.**

| Phase | Reversal | Complete when |
|---|---|---|
| 1 | Revert W1 and apply; switches nothing. | Terraform plan shows no `carrier_webhook_secret`. |
| 2 | Revert the pull request and redeploy the API server. | No `bullmq` worker is connected to `carrier-events`. |
| 3 | Stop the listener process, or have the carrier stop delivering (G7). | Carrier deliveries fail and fall to carrier redelivery (R1); events already queued are drained by the worker if phase 2 stays deployed. |

## 8. Verification

| Element | Check | Where it runs | Before the change | After |
|---|---|---|---|---|
| INFRA-1 | Probe: `terraform plan` against the environment's state. | Each deployed environment (G9), phase 1 | Plan creates `google_secret_manager_secret.carrier_webhook_secret`. | After apply, plan reports no changes. |
| INFRA-1 | Probe: `gcloud secrets versions list carrier-webhook-secret`. | Each deployed environment, phase 1 gate | Error: secret not found. | At least one version in state `enabled`. |
| CONFIG-1 | Probe: `npm ls bullmq`. | Branch, phase 2 | `(empty)`. | One exact version, matching `package.json`. |
| INTEGRATION-1 | Covered by TEST-1's enqueue case and TEST-2's consumption cases; no separate probe. | Branch, phases 2–3 | No queue module. | Tests pass. |
| INTEGRATION-2, TEST-2 | Probe: `npm test -- src/carrier-worker.test.ts`. | Branch, phase 2 | No such test file. | All TEST-2 cases pass. |
| API-1, TEST-1 | Probe: `npm test -- src/webhook-listener.test.ts`. | Branch, phase 3 | No such test file. | All TEST-1 cases pass. |
| API-1, INTEGRATION-2 | Triggered: a signed carrier test delivery, then `GET /shipments/:id` for its shipment. | Each deployed environment, after phase 3 and G7 | Listener port refuses connections; status unchanged. | Listener answers 202 and the status matches the event. |
| R1 | Observed only: listener 503 responses while Redis is unavailable, and whether the carrier redelivers them. | Production, ongoing | — | Observation, not a test; its duration and signal depend on G1. |

TEST-1 and TEST-2 are the checks themselves, so they have no rows of their own beyond the above.

## 9. Cleanup

None: the change adds and removes nothing that exists today.

## 10. Out of scope

| Item | Owner | Placement |
|---|---|---|
| The carrier's redelivery schedule for unanswered webhooks (fixes D9's expiry and R1's loss window) | Carrier integrations team | TRK-41 |
| Persisting shipment status outside the process: the store is a process-local `Map` (`src/shipments.ts:10`) that nothing populates. Surfaced during analysis. | shipment-tracker team | No ticket number — the tracker was not reachable from this run (gap G11). |

### Declared gaps

| # | Gap | Owner | Placement |
|---|---|---|---|
| G1 | The carrier's redelivery schedule is undocumented. | Carrier integrations team | TRK-41; fixes D9's 7-day expiry and R1's loss window. |
| G2 | The carrier's signature header name, encoding and exact signed bytes are not established. | Carrier integrations team | Blocks the phase 2–3 merge (API-1). |
| G3 | The carrier's payload schema — event id field, tracking id field, status vocabulary — is not established. | Carrier integrations team | Blocks the phase 2–3 merge (INTEGRATION-2's parsing and status mapping, D11). |
| G4 | How the service is deployed, how secrets and `REDIS_URL` reach its processes, and how the carrier reaches a second port are not in the repository. | shipment-tracker team (live-system lookup) | Blocks the phase 1 gate and the phase 3 deploy. |
| G5 | The apply mechanism for `infra/` is not in the repository. | shipment-tracker team | Blocks the phase 1 gate. |
| G6 | — (code not used) | — | — |
| G7 | Who generates the secret value, adds the version, shares it with the carrier and registers the webhook URL. | Carrier integrations team | Gates switching phase 3 on. |
| G8 | The exact `bullmq` version: the rule is D10, the registry was unreachable from this run. | shipment-tracker team | W2, at implementation. |
| G9 | No environments or promotion order are declared in the repository. | shipment-tracker team | Blocks the phase 1 gate and the waiting period in section 7. |
| G10 | No fact was established on `bullmq`'s requirements on the Redis server's configuration against `shipment-tracker-cache`. | shipment-tracker team | Blocks the phase 2 deploy. |
| G11 | The issue tracker was not reachable from this run, so the spec's own tickets and the persistence ticket are unnumbered. | shipment-tracker team | Before task split. |

## 11. Tickets

| Ticket | State | Covers |
|---|---|---|
| TRK-41 | Exists (from the closing notes; not opened in the tracker) | Carrier redelivery schedule, gap G1. |

The tracker was not queried; whether tickets exist for this spec's own work is unknown (gap G11).

## 12. Appendix — the evidence record

| Claim | How it was verified |
|---|---|
| The API server answers only `GET /shipments/:id`, 404 otherwise. | `src/server.ts:6-15`; `out.session/research/current-intake.md` (Intake). |
| `setStatus` has no caller. | `out.session/research/current-intake.md` (Intake), citing `src/shipments.ts:16`; `src/` holds only `server.ts` and `shipments.ts` (`git ls-files`). |
| Shipment status is a process-local `Map`, which nothing populates. | `src/shipments.ts:10`; the only writer, `setStatus` (`src/shipments.ts:16-19`), updates existing entries only. |
| A shipment records its carrier tracking id. | `src/shipments.ts:5`. Inference that the carrier identifies events by it (D11); unconfirmed until G3. |
| Secrets are Terraform-declared Secret Manager resources; no signing secret exists. | `infra/main.tf:1-7`; `out.session/research/current-intake.md` (Secrets and Redis). |
| One Redis instance exists. | `infra/main.tf:9-12`; `out.session/research/current-intake.md` (Secrets and Redis). |
| `ioredis` is declared but no source file imports it; `bullmq` is not a dependency. | `package.json:9`; `grep -rn "ioredis\|redis" src` returns nothing at `729b5e7`. |
| Dependencies are pinned exact. | `package.json:9-13`. |
| Tests run with vitest via `npm test`. | `package.json:6`. |
| No test file exists today. | `git ls-files` at `729b5e7` lists no `*.test.ts`. |
| `infra/` is protected and needs recorded consent. | `CLAUDE.md:7-8`; `out.session/research/current-intake.md` (Repository rules). |
| Every mechanism choice is recorded as an ADR before dependent work lands. | `docs/adr/0001-record-decisions.md:3-6`; `docs/CLAUDE.md:5-6`. |
| No deployment, CI or Terraform pipeline configuration is in the repository. | `git ls-files` at `729b5e7` lists ten files, none of them deployment or pipeline configuration. |
| The API server's port comes from `PORT`, default 8080. | `src/server.ts:4`. |
| 65,536 bytes (D8), 7 days (D9) and port 8081 (D12) have no measured basis. | Values chosen while writing; recorded as assistant-taken decisions pending ratification. |
