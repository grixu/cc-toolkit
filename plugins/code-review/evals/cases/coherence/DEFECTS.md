# Planted seams — coherence

`reset-sandbox.sh` copies this directory, minus this file, into `.sandbox/coherence` and commits
it, so the lens Greps for counterparts in a checkout that holds no answer key. eval-34 passes the
recall files, eval-35 the calibration files; each is reviewed whole, as added code.

## Findings the coherence lens must raise (eval-34)

| seam | side A | side B | rule |
|---|---|---|---|
| reload interval | `docs/flags.md:L3-L4` "reloads that file every 60 seconds" | `src/flags.ts:L10` `FLAG_RELOAD_INTERVAL_MS = 5 * 60_000` | doc-drift · medium |
| ADR names a method the code lacks | `docs/adr/0007-outbox-writes.md:L12` `OutboxWriter.enqueueBatch()` | `src/outbox/writer.ts:L12` has `enqueue()` only | doc-drift (invariant-breach accepted) |
| changeset default | `.changeset/quiet-hours-default.md:L5` "on by default" | `src/flags.ts:L8` `quietHours: false` | doc-drift · medium |
| column vs validator | `migrations/0012_channel_handle.sql:L5` `varchar(32)` | `src/schemas/channel.ts:L5` `.max(64)` | schema-drift · high — a 33–64 character handle passes validation and fails the insert |
| required key missing from compose | `src/config.ts:L9` `required('SMTP_URL')` | `docker-compose.yml:L6-L9` sets `SMTP_HOST`/`SMTP_PORT`, no `SMTP_URL` | config-drift · high — the service throws at start under compose |

## Look-alikes the lens must leave alone (eval-35)

- `docs/roadmap.md` describes digest emails under "Planned — not built yet": prose labelled
  plan, not doc-drift.
- `src/logging.ts:L4` reads `LOG_LEVEL` with an `'info'` default that compose never sets: a key
  with a code default is evidently optional, not config-drift.
- `migrations/0013_profile_display_name.sql` makes `display_name` `varchar(120)` while
  `src/schemas/profile.ts:L4` caps it at 80: the model is stricter than the column, so nothing
  it accepts fails the insert.
- `docs/adr/0006-delivery-retries.md` names `RetryPolicy.next()`, which `src/delivery/retry.ts`
  has, with the five-minute cap the ADR states, and `src/delivery/webhook.ts` retries through it.
- `CHANGELOG.md`'s released `[1.3.0]` entry says a webhook call times out after 10 s while
  `src/delivery/webhook.ts:L3` sets 15 s: a released section is history, and `[Unreleased]`
  states 15 s.
