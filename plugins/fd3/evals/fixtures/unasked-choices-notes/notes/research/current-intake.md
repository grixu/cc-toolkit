# Lookup: carrier status intake today, and the repository's rules

Answered against the repository at the session's HEAD.

## Intake

- The API server (`src/server.ts:6-15`) answers `GET /shipments/:id` and 404 for everything else.
  No route accepts carrier traffic.
- `setStatus` (`src/shipments.ts:16`) is exported and has no caller.

## Secrets and Redis

- Secrets are Secret Manager resources declared in Terraform; `infra/main.tf:1-7` declares the one
  that exists, `shipment-tracker-database-url`.
- One Redis instance, `shipment-tracker-cache` (`infra/main.tf:9-12`). The code depends on
  `ioredis` 5.4.1 (`package.json:9`); `bullmq` is not a dependency.

## Repository rules

- `CLAUDE.md:7-8`: everything under `infra/` is protected — no file there is created or edited
  without the user's explicit consent, recorded in the spec or task that does it.
- `docs/CLAUDE.md:5-6`: a mechanism choice without an ADR is an ADR to write; whether to write one
  is the user's call. `docs/adr/` holds one record today, `0001-record-decisions.md`.

Method: read `src/`, `infra/`, `package.json`, `CLAUDE.md` and `docs/` whole.
