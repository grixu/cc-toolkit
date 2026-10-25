Lens: correctness · files judged: 2 of 2

## FINDINGS (primary)
- `correctness` · off-by-one · high · `src/order-sync.ts:L13` — with `totalPages` 3 the loop fetches pages 0 and 1 only, so the last page's orders never reach the result → loop while `page < totalPages`
- `correctness` · swallowed-error · medium · `src/order-sync.ts:L20-L25` — a failed `ledger.post` is logged and `syncOrder` still returns `{ ok: true }`, so the caller marks an order synced that the ledger never saw → rethrow after logging, or return `{ ok: false }`

Cleared: `labelFor`'s `never` default is an exhaustive assertion, not an `unhandled-case`; `recordSync` drops a telemetry failure on purpose and its comment says why.
