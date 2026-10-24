# Queue status — spec

Status: validated

## 1. Elements

| Code | Element | Kind |
|---|---|---|
| QS-DB-1 | `queue_status` table: queue name, pending count, updated at | migration |
| QS-DB-2 | Repository reading `queue_status` rows | code |
| QS-RUN-1 | Local compose service running the queue worker | config |
| QS-DEP-1 | Redis client dependency for the worker's lock | dependency |
| QS-API-1 | `GET /queue/status` returning every queue's row | code |
| QS-DOC-1 | Endpoint documented in `docs/api.md` | docs |

## 2. Decisions

- D1. Status rows are written by the worker, read by the API; the API never writes them.
- D2. The worker takes a Redis lock per queue, so two workers never drain one queue.

## 3. Rollout

| Phase | Contents | Gate |
|---|---|---|
| 1 | every element | the branch's CI passes |

## 4. Verification

| Element | Kind | Check |
|---|---|---|
| QS-DB-1 | behaviour | the migration applies on a fresh database |
| QS-API-1 | behaviour | `GET /queue/status` lists one row per queue |
