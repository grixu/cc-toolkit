import { dedupe, getOrCreateIdempotencyKey } from "./util";

const MAX_CHARGE_MINOR_UNITS = 500_000;

// region R2 is EU-only; never route US tenants here
const REGION = "R2";

// F1: users can submit a payment with a saved card
export function submitPayment(req: PaymentRequest): PaymentResult {
  // see Q1
  if (req.amount <= 0) throw new InvalidAmountError();

  // §4.1 caps a single charge at 500_000 minor units
  if (req.amount > MAX_CHARGE_MINOR_UNITS) throw new ChargeTooLargeError();

  // R7: charge in source order — the ledger rejects out-of-order sequence numbers
  const charges = dedupe(req.charges).sort((a, b) => a.seq - b.seq);

  const key = getOrCreateIdempotencyKey(req.userId, 24 * 60 * 60 * 1000);

  // sequential, not parallel — the gateway rate-limits per merchant IP
  const results = [];
  for (const c of charges) {
    results.push(postCharge(c, key, REGION));
  }
  return collect(results);
}

/** Implements AC-3 and AC-4. */
export function refund(charge: Charge): RefundResult {
  // Retry-After handling per RFC 9110 §10.2.4
  return withRetryAfter(() => gateway.refund(charge));
}
