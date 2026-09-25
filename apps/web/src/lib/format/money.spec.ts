import { describe, expect, it } from 'vitest';
import { formatMoney, parseMoneyInput } from './money';

describe('formatMoney', () => {
  it('formats UZS without fraction and with the currency code', () => {
    const text = formatMoney('11990000.00', 'UZS', 'ru').replace(/\s/g, ' ');
    expect(text).toContain('11 990 000');
    expect(text).toContain('UZS');
  });

  it('keeps cents for USD', () => {
    expect(formatMoney('12.5', 'USD', 'ru')).toContain('12,50');
  });

  it('shows a dash for missing prices', () => {
    expect(formatMoney(null, 'UZS', 'ru')).toBe('—');
    expect(formatMoney('abc', 'UZS', 'ru')).toBe('—');
  });
});

describe('parseMoneyInput', () => {
  it('accepts spaces and comma as decimal separator', () => {
    expect(parseMoneyInput('11 990 000')).toBe('11990000');
    expect(parseMoneyInput('12,5')).toBe('12.5');
  });

  it('rejects invalid input and treats empty as null', () => {
    expect(parseMoneyInput('')).toBeNull();
    expect(parseMoneyInput('12.345')).toBeNull();
    expect(parseMoneyInput('-5')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
  });
});
