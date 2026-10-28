# Planted gaps — tests · mutation-gap

eval-38 reviews `pricing.ts` with `pricing.test.ts`, eval-39 `loyalty.ts` with `loyalty.test.ts`,
each pair whole. Neither run sees this file. The directory is `tests-mutation/`, not `tests/`, so
`scope.md` classes the `.ts` sources as `source` and only the `*.test.ts` files as `test`.

## Findings the readability & tests lens must raise (eval-38)

All three are `tests` · mutation-gap · medium, filed under `pricing.ts` — one collapsed bullet or
three:

- `shippingCents` (L23): `>= FREE_SHIPPING_MIN_CENTS` survives a flip to `>` — the tests use
  subtotals of 1 000 and 20 000 only, nowhere near 5 000.
- `bulkDiscountCents` (L27): deleting the `qty < 1` guard survives — no test feeds a quantity of 0.
- `qualifiesForPriority` (L32): `&&` survives a flip to `||` — the member has a big cart and the
  guest a small one, so both operands always agree.

## The look-alike the lens must leave alone

- `bulkDiscountCents`'s `qty >= BULK_MIN_QTY` (L28) is pinned: the tests sit at 10 and 9.

## The calibration twin (eval-39)

`loyalty.test.ts` pins every decision `loyalty.ts` makes: `tierFor` at 1 000 and 999, its guard at
0, -1 and 1.5, and `canRedeem` at 500 and 499 with a verified account, plus an unverified account
with points to spare, which tells `&&` from `||`. No mutation-gap.
