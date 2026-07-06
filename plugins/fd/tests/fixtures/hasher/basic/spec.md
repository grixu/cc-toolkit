# Basic feature

Preamble that is not part of any element block.

## Data

### DB-3 — Users table

Columns: id, email, created_at.

## API

### API-2 — Create user endpoint

POST /users with an idempotency key.

## Acceptance

### AC-5 — User can register

Given a valid email, a user is created.

### FR-2 — Registration is idempotent

Repeated POSTs with the same key create one user.

### ZZZ-1 — Unknown kind anchor

This heading matches the anchor grammar but ZZZ is not a known KIND.
