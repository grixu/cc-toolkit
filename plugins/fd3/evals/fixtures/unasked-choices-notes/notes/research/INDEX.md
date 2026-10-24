# Research index

| ID | Question | Condensed answer | Sources | Report |
|---|---|---|---|---|
| I1 | How does carrier status reach the service today? | It does not: no route accepts carrier traffic, and `setStatus` has no caller. The API server serves only `GET /shipments/:id`. | `src/server.ts:6-15`, `src/shipments.ts:16` | `current-intake.md` |
| I2 | Where do the service's secrets live? | Secret Manager, declared in Terraform: `infra/main.tf:1` holds the database URL secret. No signing secret exists. | `infra/main.tf:1-7` | `current-intake.md` |
| I3 | What Redis does the service already run? | One Memorystore instance, `infra/main.tf:9`; the code reaches it through `ioredis` 5.4.1. `bullmq` is not a dependency yet. | `infra/main.tf:9-12`, `package.json:9` | `current-intake.md` |
| I4 | What do the repository's own rules say about this change? | `CLAUDE.md` marks everything under `infra/` protected: no file there is created or edited without the user's explicit consent, recorded in the spec. `docs/CLAUDE.md`: a mechanism choice without an ADR is an ADR to write, and whether to write one is the user's call. | `CLAUDE.md:7-8`, `docs/CLAUDE.md:5-6` | `current-intake.md` |
