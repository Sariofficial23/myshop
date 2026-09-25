import { ErrorCode } from '@myshop/shared';
import { describe, expect, it } from 'vitest';
import { AppException } from '../common/errors/app.exception.js';
import { assertNoDuplicateSerials, validateItemSerials } from './purchase-validation.js';

function error(fn: () => unknown): AppException | undefined {
  try {
    fn();
  } catch (e) {
    return e as AppException;
  }
  return undefined;
}

const base = { variantId: 'v1', productName: 'iPhone 15' };

describe('validateItemSerials', () => {
  it('normalizes valid IMEI numbers when count matches quantity', () => {
    expect(
      validateItemSerials({
        ...base,
        quantity: 2,
        serialType: 'IMEI',
        serialNumbers: ['49-015420-323751-8', '356938035643809'],
      }),
    ).toEqual(['490154203237518', '356938035643809']);
  });

  it('requires exactly one number per unit', () => {
    const e = error(() =>
      validateItemSerials({
        ...base,
        quantity: 3,
        serialType: 'IMEI',
        serialNumbers: ['490154203237518'],
      }),
    );
    expect(e?.code).toBe(ErrorCode.SERIAL_COUNT_MISMATCH);
    expect(e?.details).toEqual({ variantId: 'v1', expected: 3, received: 1 });
  });

  it('rejects IMEI with a wrong check digit', () => {
    const e = error(() =>
      validateItemSerials({
        ...base,
        quantity: 1,
        serialType: 'IMEI',
        serialNumbers: ['490154203237519'],
      }),
    );
    expect(e?.code).toBe(ErrorCode.INVALID_IMEI);
    expect(e?.details).toMatchObject({ numbers: ['490154203237519'] });
  });

  it('validates serial numbers for SERIAL products', () => {
    expect(
      validateItemSerials({
        ...base,
        quantity: 1,
        serialType: 'SERIAL',
        serialNumbers: ['c02xk1abjg5h'],
      }),
    ).toEqual(['C02XK1ABJG5H']);
    expect(
      error(() =>
        validateItemSerials({ ...base, quantity: 1, serialType: 'SERIAL', serialNumbers: ['x'] }),
      )?.code,
    ).toBe(ErrorCode.INVALID_SERIAL_NUMBER);
  });

  it('forbids numbers for products without serial tracking', () => {
    expect(
      validateItemSerials({ ...base, quantity: 5, serialType: null, serialNumbers: [] }),
    ).toEqual([]);
    expect(
      error(() =>
        validateItemSerials({
          ...base,
          quantity: 1,
          serialType: null,
          serialNumbers: ['490154203237518'],
        }),
      )?.code,
    ).toBe(ErrorCode.SERIAL_NOT_ALLOWED);
  });
});

describe('assertNoDuplicateSerials', () => {
  it('detects repeated numbers inside one document', () => {
    expect(() => assertNoDuplicateSerials(['1', '2'])).not.toThrow();
    const e = error(() => assertNoDuplicateSerials(['1', '2', '1']));
    expect(e?.code).toBe(ErrorCode.DUPLICATE_IMEI);
    expect(e?.details).toEqual({ numbers: ['1'] });
  });
});
