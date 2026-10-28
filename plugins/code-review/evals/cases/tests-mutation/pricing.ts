export interface CartLine {
  sku: string;
  unitCents: number;
  qty: number;
}

export interface Cart {
  lines: CartLine[];
  isMember: boolean;
}

const FREE_SHIPPING_MIN_CENTS = 5_000;
const FLAT_SHIPPING_CENTS = 499;
const BULK_MIN_QTY = 10;
const BULK_DISCOUNT_RATE = 0.1;
const PRIORITY_MIN_SUBTOTAL_CENTS = 2_000;

export function subtotalCents(cart: Cart): number {
  return cart.lines.reduce((sum, line) => sum + line.unitCents * line.qty, 0);
}

export function shippingCents(cart: Cart): number {
  return subtotalCents(cart) >= FREE_SHIPPING_MIN_CENTS ? 0 : FLAT_SHIPPING_CENTS;
}

export function bulkDiscountCents(line: CartLine): number {
  if (line.qty < 1) throw new RangeError(`line ${line.sku} has quantity ${line.qty}`);
  return line.qty >= BULK_MIN_QTY ? Math.round(line.unitCents * line.qty * BULK_DISCOUNT_RATE) : 0;
}

export function qualifiesForPriority(cart: Cart): boolean {
  return cart.isMember && subtotalCents(cart) >= PRIORITY_MIN_SUBTOTAL_CENTS;
}
