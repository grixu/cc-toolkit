# queue-service

TypeScript service that runs the job-queue workers and their status API.

## Files to protect

Never edit these without the user's explicit go-ahead:

- `docker-compose.yml` — the shared local stack every developer runs
- `db/migrations/**` — every new migration is confirm-first
- `pnpm-lock.yaml` — dependency changes are reviewed with the user before the lockfile is committed
