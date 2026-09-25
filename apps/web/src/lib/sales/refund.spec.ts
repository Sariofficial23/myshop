import { describe, expect, it } from 'vitest';
import { estimateRefundCents } from './refund';

describe('estimateRefundCents', () => {
  const line = { quantity: 3, total: '299.99', returnedQuantity: 0, refundedAmount: '0.00' };

  it('matches the backend split: 100.00 + 100.00 + 99.99', () => {
    expect(estimateRefundCents(line, 1)).toBe(10_000);
    expect(estimateRefundCents({ ...line, returnedQuantity: 2, refundedAmount: '200.00' }, 1)).toBe(
      9999,
    );
    expect(estimateRefundCents(line, 3)).toBe(29_999);
  });

  it('is zero for nothing or too much', () => {
    expect(estimateRefundCents(line, 0)).toBe(0);
    expect(estimateRefundCents(line, 4)).toBe(0);
  });
});
