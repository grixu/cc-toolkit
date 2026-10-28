# Planted defects — order-sync.ts and alias-store.ts

Not read by the lens under test: eval-21 passes only `order-sync.ts`, eval-40 only
`alias-store.ts`, whose store types sit in `store-client.ts` for the lens to read.

# order-sync.ts (eval-21)

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

# alias-store.ts (eval-40)

The patterns that pass tests and fail in production, each beside a twin that guards it. Each
finding lands on an existing `correctness` row; the eval accepts the rows the pattern maps to.

## Findings the correctness lens must raise

- `resolveAlias` (L7-L11) recurses on `alias.target` with no visited set or depth bound, so an
  alias cycle (`a` → `b` → `a`) never resolves — unbounded recursion.
- `findAlias` (L26-L32) maps every rejection of `db.aliases.fetch` to `null`, so a
  `StoreUnavailableError` timeout reaches `aliasStatus` (L34-L37) as a 404 for an alias that
  exists — catch-all error mapping, `swallowed-error`.
- `renewAlias` (L53-L56) stores any future `requestedExpiry`, while `Alias.expiresAt` in
  `store-client.ts` is never more than 90 days out — an unclamped future date.
- `purgeAliases` (L63-L71) awaits inside a `forEach` callback, so it returns `0` before any
  delete finishes and a failed delete is an unhandled rejection — async `forEach`,
  `contract-mismatch`.

## Guarded twins the lens must leave alone

- `resolveRoute` (L13-L24) keeps a `seen` set and a `MAX_HOPS` bound.
- `findRoute` (L39-L46) maps only `NotFoundError` to `null` and rethrows the rest, so
  `routeStatus` answers 404 only for a missing route.
- `renewRoute` (L58-L61) clamps the expiry to `now + MAX_TTL_MS`.
- `purgeRoutes` (L73-L79) awaits each delete in a `for…of` and returns the count after them.
