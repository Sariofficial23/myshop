import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  ErrorCode,
  isErrorCode,
  isLocale,
  STOCK_MOVEMENT_TYPES,
  StockMovementType,
} from './index.js';

describe('ErrorCode', () => {
  it('keys match values so codes are stable on the wire', () => {
    for (const [key, value] of Object.entries(ErrorCode)) {
      expect(value).toBe(key);
    }
  });

  it('contains the codes required by the specification', () => {
    expect(ERROR_CODES).toEqual(
      expect.arrayContaining([
        'INSUFFICIENT_STOCK',
        'IMEI_ALREADY_SOLD',
        'IMEI_NOT_FOUND',
        'DUPLICATE_IMEI',
        'UNAUTHORIZED',
        'FORBIDDEN',
        'PRODUCT_NOT_FOUND',
        'SALE_NOT_FOUND',
        'RETURN_LIMIT_EXCEEDED',
      ]),
    );
  });

  it('isErrorCode narrows only known codes', () => {
    expect(isErrorCode('FORBIDDEN')).toBe(true);
    expect(isErrorCode('SOMETHING_ELSE')).toBe(false);
    expect(isErrorCode(42)).toBe(false);
  });
});

describe('StockMovementType', () => {
  it('lists every documented operation that may change stock', () => {
    expect(STOCK_MOVEMENT_TYPES.toSorted()).toEqual(
      [
        'INVENTORY_ADJUSTMENT',
        'PURCHASE',
        'RETURN',
        'SALE',
        'TRANSFER_IN',
        'TRANSFER_OUT',
        'WRITE_OFF',
      ].toSorted(),
    );
    expect(StockMovementType.PURCHASE).toBe('PURCHASE');
  });
});

describe('isLocale', () => {
  it('accepts ru and uz only', () => {
    expect(isLocale('ru')).toBe(true);
    expect(isLocale('uz')).toBe(true);
    expect(isLocale('en')).toBe(false);
  });
});
