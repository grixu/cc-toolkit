## Description

Changing the quantity in the cart now keeps the applied coupon — a seamless experience that is not just a fix, but a crucial boost to customer trust. Previously `CartService.updateQuantity` recalculated the totals and silently dropped `couponCode`.

**Testing:** `pnpm test --filter cart` passed locally; not checked in a browser.

**Reviewer notes:** the coupon is now re-validated on every quantity change, which serves as a pivotal safeguard against expired codes.

## Dependencies

- None
