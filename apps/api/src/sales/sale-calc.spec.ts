import { ErrorCode } from '@myshop/shared';
import { describe, expect, it } from 'vitest';
import { AppException } from '../common/errors/app.exception.js';
import { addMonths, calculateLines, validatePayments } from './sale-calc.js';

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as AppException).code;
  }
  return undefined;
}

describe('calculateLines', () => {
  it('computes line totals, subtotal, discounts and total', () => {
    const result = calculateLines([
      { quantity: 1, price: '11990000', discount: '490000' },
      { quantity: 3, price: '0.1' },
    ]);
    expect(result.lines.map((l) => l.total.toFixed(2))).toEqual(['11500000.00', '0.30']);
    expect(result.subtotal.toFixed(2)).toBe('11990000.30');
    expect(result.discountTotal.toFixed(2)).toBe('490000.00');
    expect(result.total.toFixed(2)).toBe('11500000.30');
  });

  it('allows a 100% discount but not more', () => {
    expect(calculateLines([{ quantity: 2, price: '5', discount: '10' }]).total.toFixed(2)).toBe(
      '0.00',
    );
    expect(code(() => calculateLines([{ quantity: 2, price: '5', discount: '10.01' }]))).toBe(
      ErrorCode.DISCOUNT_TOO_LARGE,
    );
  });
});

describe('validatePayments', () => {
  const total = calculateLines([{ quantity: 1, price: '1000' }]).total;

  it('accepts exact single and mixed payments', () => {
    expect(validatePayments(total, [{ method: 'CASH', amount: '1000' }]).paid.toFixed(2)).toBe(
      '1000.00',
    );
    expect(
      validatePayments(total, [
        { method: 'CASH', amount: '400' },
        { method: 'CARD', amount: '600.00' },
      ]).payments,
    ).toHaveLength(2);
  });

  it('rejects underpayment, overpayment and non-positive amounts', () => {
    expect(code(() => validatePayments(total, [{ method: 'CASH', amount: '999.99' }]))).toBe(
      ErrorCode.PAYMENT_MISMATCH,
    );
    expect(code(() => validatePayments(total, [{ method: 'CASH', amount: '1000.01' }]))).toBe(
      ErrorCode.PAYMENT_MISMATCH,
    );
    expect(
      code(() =>
        validatePayments(total, [
          { method: 'CASH', amount: '1000' },
          { method: 'CARD', amount: '0' },
        ]),
      ),
    ).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('requires at least one payment for a regular sale', () => {
    expect(code(() => validatePayments(total, []))).toBe(ErrorCode.PAYMENT_MISMATCH);
  });

  it('installment: a down payment below the total, possibly zero', () => {
    expect(validatePayments(total, [], { partial: true }).paid.toFixed(2)).toBe('0.00');
    expect(
      validatePayments(total, [{ method: 'CASH', amount: '300' }], { partial: true }).paid.toFixed(
        2,
      ),
    ).toBe('300.00');
    expect(
      code(() => validatePayments(total, [{ method: 'CASH', amount: '1000' }], { partial: true })),
    ).toBe(ErrorCode.PAYMENT_MISMATCH);
  });
});

describe('addMonths (warranty end)', () => {
  it('adds months and clamps to the end of shorter months', () => {
    expect(addMonths(new Date('2026-09-25T10:00:00Z'), 12).toISOString()).toBe(
      '2027-09-25T10:00:00.000Z',
    );
    expect(addMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
    expect(addMonths(new Date('2028-01-31T00:00:00Z'), 1).toISOString()).toBe(
      '2028-02-29T00:00:00.000Z',
    );
  });
});
