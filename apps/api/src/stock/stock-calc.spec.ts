import { describe, expect, it } from 'vitest';
import { lineTotal, nextBalance, sumDecimals, weightedAverageCost } from './stock-calc.js';

describe('weightedAverageCost', () => {
  it('equals the incoming cost when there was no stock', () => {
    expect(weightedAverageCost(0, 0, 5, '10000000').toFixed(2)).toBe('10000000.00');
  });

  it('averages existing and incoming stock by quantity', () => {
    // 2 шт по 10 000 000 + 3 шт по 11 000 000 = 53 000 000 / 5 = 10 600 000
    expect(weightedAverageCost(2, '10000000', 3, '11000000').toFixed(2)).toBe('10600000.00');
  });

  it('rounds to 2 decimals half-up', () => {
    // (1 × 10 + 2 × 10.01) / 3 = 10.00666… → 10.01
    expect(weightedAverageCost(1, '10', 2, '10.01').toFixed(2)).toBe('10.01');
  });

  it('ignores negative current stock and rejects non-positive incoming quantity', () => {
    expect(weightedAverageCost(-1, '5', 1, '7').toFixed(2)).toBe('7.00');
    expect(() => weightedAverageCost(1, '5', 0, '7')).toThrow(/positive/);
  });
});

describe('line totals', () => {
  it('multiplies quantity by price without float errors', () => {
    expect(lineTotal(3, '0.1').toFixed(2)).toBe('0.30');
    expect(lineTotal(2, '11990000').toFixed(2)).toBe('23980000.00');
    expect(sumDecimals(['0.10', '0.20', lineTotal(3, '0.1')]).toFixed(2)).toBe('0.60');
  });
});

describe('nextBalance', () => {
  it('adds incoming and subtracts outgoing quantities', () => {
    expect(nextBalance(5, 3)).toBe(8);
    expect(nextBalance(5, -5)).toBe(0);
  });

  it('never allows negative stock', () => {
    expect(nextBalance(2, -3)).toBeNull();
  });
});
