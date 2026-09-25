import { describe, expect, it } from 'vitest';
import { paymentTypeOf } from './index.js';

describe('paymentTypeOf', () => {
  it('uses the single method', () => {
    expect(paymentTypeOf(['CASH'])).toBe('CASH');
    expect(paymentTypeOf(['CARD', 'CARD'])).toBe('CARD');
  });

  it('is MIXED for several methods', () => {
    expect(paymentTypeOf(['CASH', 'CARD'])).toBe('MIXED');
  });

  it('requires at least one payment', () => {
    expect(() => paymentTypeOf([])).toThrow(/payment/);
  });
});
