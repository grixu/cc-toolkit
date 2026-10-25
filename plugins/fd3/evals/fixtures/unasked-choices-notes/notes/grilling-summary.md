# Closing notes — carrier tracking webhooks

Session of 2026-10-20. The user's closing message: **"Confirmed — write it up."**

## 1. Ratified decisions

1. Q1 b — Carrier tracking webhooks are received by a new listener process, separate from the API
   server in `src/server.ts`, on a dedicated port of its own. facts: I1
2. Q2 a — Every webhook request is verified with an HMAC-SHA256 signature over the raw body. The
   shared signing secret lives in Secret Manager as a new `carrier-webhook-secret` resource in a new
   file, `infra/secrets.tf`. facts: I2, I4
3. Q3 a — Verified events go onto a queue built with the `bullmq` library on the existing Redis
   instance, and a worker drains it and calls `setStatus`. facts: I3, I4
4. Q4 a — A request whose body is larger than a maximum size is rejected with 413 before its
   signature is checked. facts: none
5. Q5 b — The worker drops an event whose carrier event id it has already processed. facts: I1

## 2. Decisions I took myself

None.

## 3. Risks the user accepted

1. While Redis is down the listener answers 503 and relies on the carrier to redeliver; events the
   carrier gives up on are lost.

## 4. Left for later

1. The carrier's redelivery schedule for unanswered webhooks is undocumented. Owner: carrier
   integrations team. Ticket: TRK-41.

## 5. Research files

- `notes/research/INDEX.md` — the session's research index
- `notes/research/current-intake.md` — how carrier status reaches the service today, and the
  repository's own conventions
