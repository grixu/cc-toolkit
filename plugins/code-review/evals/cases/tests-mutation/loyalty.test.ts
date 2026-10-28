import { describe, expect, it } from 'vitest';
import { canRedeem, tierFor } from './loyalty';

describe('tierFor', () => {
  it('makes a 1000-point balance gold', () => {
    expect(tierFor(1_000)).toBe('gold');
  });

  it('keeps a 999-point balance silver', () => {
    expect(tierFor(999)).toBe('silver');
  });

  it('accepts an empty balance as silver', () => {
    expect(tierFor(0)).toBe('silver');
  });

  it('rejects a negative balance', () => {
    expect(() => tierFor(-1)).toThrow(RangeError);
  });

  it('rejects a fractional balance', () => {
    expect(() => tierFor(1.5)).toThrow(RangeError);
  });
});

describe('canRedeem', () => {
  it('lets a verified account with 500 points redeem', () => {
    expect(canRedeem({ verified: true, points: 500 })).toBe(true);
  });

  it('stops a verified account with 499 points', () => {
    expect(canRedeem({ verified: true, points: 499 })).toBe(false);
  });

  it('stops an unverified account however many points it has', () => {
    expect(canRedeem({ verified: false, points: 5_000 })).toBe(false);
  });
});
