import { describe, expect, it } from 'vitest';
import {
  buildInstallment,
  buildPayments,
  cartTotals,
  fromCents,
  lineTotalCents,
  mixedRemainder,
  toCents,
} from './cart';

describe('cart math', () => {
  it('converts money strings to cents and back without float errors', () => {
    expect(toCents('11990000')).toBe(1_199_000_000);
    expect(toCents('0.1')).toBe(10);
    expect(toCents('19.99')).toBe(1999);
    expect(toCents('1.234')).toBeNull();
    expect(toCents('-5')).toBeNull();
    expect(fromCents(1999)).toBe('19.99');
    expect(fromCents(1_199_000_000)).toBe('11990000');
    expect(fromCents(5)).toBe('0.05');
  });

  it('sums lines with discounts', () => {
    const lines = [
      { quantity: 2, priceCents: toCents('0.1')!, discountCents: 0 },
      { quantity: 1, priceCents: toCents('0.2')!, discountCents: toCents('0.05')! },
    ];
    expect(lineTotalCents(lines[1]!)).toBe(15);
    expect(cartTotals(lines)).toEqual({ subtotal: 40, discount: 5, total: 35 });
  });

  it('builds a single payment for the whole amount', () => {
    expect(buildPayments('CARD', 150_000, {})).toEqual([{ method: 'CARD', amount: '1500' }]);
    expect(buildPayments('CASH', 0, {})).toBeNull();
  });

  it('accepts mixed payments only when they add up exactly', () => {
    expect(buildPayments('MIXED', 100_000, { CASH: '600', CARD: '400', TRANSFER: '' })).toEqual([
      { method: 'CASH', amount: '600' },
      { method: 'CARD', amount: '400' },
    ]);
    expect(buildPayments('MIXED', 100_000, { CASH: '600', CARD: '300' })).toBeNull();
    // Суммы вводят с пробелами и запятой: "2 000 000", "399,5"
    expect(buildPayments('MIXED', 2_100_000, { CASH: '1 000', CARD: '20 000' })).toEqual([
      { method: 'CASH', amount: '1000' },
      { method: 'CARD', amount: '20000' },
    ]);
    expect(mixedRemainder(100_000, { CASH: '599,5' })).toBe(40_050);
    expect(buildPayments('MIXED', 100_000, { CASH: 'abc' })).toBeNull();
    expect(mixedRemainder(100_000, { CASH: '600', CARD: '300' })).toBe(10_000);
    expect(mixedRemainder(100_000, { CASH: '1100' })).toBe(-10_000);
  });

  it('installment: down payment below the total, monthly amount rounded up', () => {
    expect(buildInstallment(1_000_00, '', 'CASH', '3')).toEqual({
      payments: [],
      debtCents: 1_000_00,
      monthlyCents: 33_334,
      months: 3,
    });
    expect(buildInstallment(1_000_00, '200', 'CARD', '4')?.payments).toEqual([
      { method: 'CARD', amount: '200' },
    ]);
    expect(buildInstallment(1_000_00, '1000', 'CASH', '4')).toBeNull();
    expect(buildInstallment(1_000_00, '', 'CASH', '0')).toBeNull();
    expect(buildInstallment(1_000_00, 'abc', 'CASH', '6')).toBeNull();
  });
});
