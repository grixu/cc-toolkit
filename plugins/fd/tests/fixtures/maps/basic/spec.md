# Basic feature

Preamble that is not part of any element block.

## Data

### DB-3 — Users table

Columns: id, email, created_at.

## API

### API-2 — Create user endpoint

POST /users with an idempotency key.

## Modules

### MOD-1 — Onboarding flow

Coordinates registration and confirmation.

## Requirements

### FR-2 — Registration is idempotent

Repeated POSTs with the same key create one user.

### NFR-1 — Registration latency

Registration completes within 300ms at p95.

## Acceptance

### AC-5 — User can register

covers:   FR-2 , NFR-1

Given a valid email, a user is created.

### AC-6 — User sees confirmation

The confirmation screen renders after registration.
