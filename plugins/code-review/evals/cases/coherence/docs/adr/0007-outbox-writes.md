# 0007 — Notifications are written through the outbox

Status: Accepted

## Context

Delivery workers and the API both created notification rows, and a crash between the insert and
the publish lost messages.

## Decision

Every write of a notification goes through `OutboxWriter.enqueueBatch()`, which inserts the
notifications and their outbox events in one transaction. Nothing inserts into `notifications`
directly.

## Consequences

The relay publishes from the outbox table, so a crash after the commit only delays a message.
