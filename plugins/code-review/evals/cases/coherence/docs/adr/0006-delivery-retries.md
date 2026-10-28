# 0006 — Delivery retries back off through one policy

Status: Accepted

## Context

Each channel adapter retried failed deliveries on its own schedule, and the webhook adapter
retried a dead endpoint every second.

## Decision

Every delivery retry takes its delay from `RetryPolicy.next()`, which doubles the delay per
attempt and caps it at five minutes.

## Consequences

A dead endpoint costs one attempt per five minutes once the backoff has grown.
