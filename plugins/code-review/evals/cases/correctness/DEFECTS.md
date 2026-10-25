# Planted defects — order-sync.ts

Not read by the lens under test: the eval passes only `order-sync.ts`.

## Findings the correctness lens must raise

- `fetchAllOrders` loops while `page < totalPages - 1`, so the last page is never fetched —
  `correctness` · off-by-one · high.
- `syncOrder` catches a failed `ledger.post`, logs it, and still returns `{ ok: true }`, so the
  caller marks the order synced on a failure it never sees — `correctness` · swallowed-error ·
  medium.

## Look-alikes the lens must leave alone

- `labelFor`'s `default:` arm assigns to `never` and throws: an exhaustive defensive assertion,
  not an `unhandled-case`.
- `recordSync` swallows a telemetry failure on purpose, and its comment says why: the
  best-effort calibration of `swallowed-error`.

## Outside the lens's family

- `86400 * 1000` in `isStale` is an unnamed literal, `readability` · magic-literal. A correctness
  Scanner may hand it off; when it does, the `HANDOFF` line names `readability`, never an
  invented family.
