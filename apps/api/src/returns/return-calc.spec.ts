import { describe, expect, it } from 'vitest';
import { refundAmount } from './return-calc.js';

describe('refundAmount', () => {
  it('returns the whole line amount when everything is returned', () => {
    const line = { quantity: 1, total: '11890000', returnedQuantity: 0, refundedAmount: '0' };
    expect(refundAmount(line, 1).toFixed(2)).toBe('11890000.00');
  });

  it('splits a discounted line proportionally without losing cents', () => {
    // 3 × 100 − 0.01 скидки = 299.99
    const line = { quantity: 3, total: '299.99', returnedQuantity: 0, refundedAmount: '0' };
    const first = refundAmount(line, 1);
    expect(first.toFixed(2)).toBe('100.00');
    const second = refundAmount({ ...line, returnedQuantity: 1, refundedAmount: first }, 1);
    expect(second.toFixed(2)).toBe('100.00');
    const last = refundAmount(
      { ...line, returnedQuantity: 2, refundedAmount: first.add(second) },
      1,
    );
    expect(last.toFixed(2)).toBe('99.99');
    expect(first.add(second).add(last).toFixed(2)).toBe('299.99');
  });

  it('rejects returning more than is left', () => {
    const line = { quantity: 2, total: '200', returnedQuantity: 1, refundedAmount: '100' };
    expect(() => refundAmount(line, 2)).toThrow('Invalid return quantity');
    expect(() => refundAmount(line, 0)).toThrow('Invalid return quantity');
  });
});
