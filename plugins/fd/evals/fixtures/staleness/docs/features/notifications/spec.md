# Notifications

Outbound notification delivery for the platform. Consumers post a notification, a
dispatcher routes it to the right channel, and every attempt is logged.

## API

### API-1 — Send notification endpoint

POST /notifications accepts `{ channel, recipient, body, idempotencyKey }` and returns
`202 Accepted` with a generated notification id. A repeated `idempotencyKey` returns the
original notification id instead of creating a duplicate. Validation rejects an unknown
channel with `400`.

## Modules

### MODULE-1 — Notification dispatcher

Routes an accepted notification to the transport for its channel (email, sms) and
records the outcome. Retries a transient transport failure up to three times.

## Data

### DB-1 — Notification log table

Columns: `id`, `channel`, `recipient`, `status`, `created_at`. One row per send attempt.

## Acceptance

### AC-1 — A valid notification is accepted

Given a request with a known channel, the endpoint returns `202` and a notification id.

### AC-2 — The dispatcher routes by channel

An accepted notification reaches the transport registered for its channel.

### AC-3 — Every attempt is logged

Each send attempt writes exactly one row to the notification log.
