# Closing notes — asynchronous settlement with a merchant-visible ledger

Session of 2026-07-27. The user's closing message: **"Confirmed — write it up."**

## 1. Ratified decisions

1. Q1 a — Ledger entries live in a new `ledger_entries` table owned by the ledger service (D1).
   facts: none
2. Q2 a — Checkout writes each settlement synchronously on the charge path, behind the
   `asyncSettlement` flag, default off; with the flag on, a ledger write failure fails the charge
   with HTTP 502 (D2). The options were:
   - a) synchronous, and a failed write fails the charge with 502 — chosen;
   - b) synchronous, but a failed write is logged with the order id and the charge still returns
     `accepted`; the missing entry is backfilled by hand from that log line;
   - c) through a queue — declined, no current volume justifies a broker.
   facts: none
3. Q3 a — The dashboard reads through the ledger's `GET /ledger/entries` endpoint, never the
   database (D3). facts: none
4. Q4 a — Phase 1 builds everything dark; phase 2 switches behaviour (D4). facts: none

## 2. Decisions I took myself

None.

## 3. Risks the user accepted

1. With the flag on, a ledger write failure surfaces on the charge path (follows from Q2 a).

## 4. Research files

None moved: every fact the spec cites is in its own evidence record.
