import { describe, expect, it } from 'vitest';
import { bulkDiscountCents, qualifiesForPriority, shippingCents, type Cart } from './pricing';

const cart = (unitCents: number, qty: number, isMember = false): Cart => ({
  lines: [{ sku: 'TEA-01', unitCents, qty }],
  isMember,
});

describe('shippingCents', () => {
  it('charges flat shipping on a small cart', () => {
    expect(shippingCents(cart(1_000, 1))).toBe(499);
  });

  it('ships a large cart free', () => {
    expect(shippingCents(cart(10_000, 2))).toBe(0);
  });
});

describe('bulkDiscountCents', () => {
  it('takes 10% off a line of ten', () => {
    expect(bulkDiscountCents({ sku: 'TEA-01', unitCents: 500, qty: 10 })).toBe(500);
  });

  it('gives a line of nine no discount', () => {
    expect(bulkDiscountCents({ sku: 'TEA-01', unitCents: 500, qty: 9 })).toBe(0);
  });
});

describe('qualifiesForPriority', () => {
  it('gives a member with a big cart priority', () => {
    expect(qualifiesForPriority(cart(5_000, 1, true))).toBe(true);
  });

  it('gives a guest with a small cart no priority', () => {
    expect(qualifiesForPriority(cart(500, 1, false))).toBe(false);
  });
});
