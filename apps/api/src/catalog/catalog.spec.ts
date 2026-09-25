import { ErrorCode } from '@myshop/shared';
import { describe, expect, it } from 'vitest';
import { AppException } from '../common/errors/app.exception.js';
import { normalizeBarcodes, validateAttributes } from './catalog-validation.js';
import { generateSku, variantSku } from './sku.js';

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof AppException ? error.code : 'other';
  }
  return undefined;
}

describe('SKU generation', () => {
  it('generates readable unique SKUs', () => {
    const skus = new Set(Array.from({ length: 1000 }, () => generateSku()));
    expect(skus.size).toBe(1000);
    for (const sku of skus) expect(sku).toMatch(/^P-[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  it('uses product SKU for a single variant and numbers otherwise', () => {
    expect(variantSku('IPH15', 0, 1)).toBe('IPH15');
    expect(variantSku('IPH15', 0, 3)).toBe('IPH15-1');
    expect(variantSku('IPH15', 2, 3)).toBe('IPH15-3');
  });
});

describe('validateAttributes', () => {
  it('accepts string key/values and defaults to {}', () => {
    expect(validateAttributes({ diagonal: '55"' })).toEqual({ diagonal: '55"' });
    expect(validateAttributes(undefined)).toEqual({});
  });

  it('rejects non-string values and too many keys', () => {
    expect(code(() => validateAttributes({ size: 55 }))).toBe(ErrorCode.VALIDATION_ERROR);
    const many = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, 'v']));
    expect(code(() => validateAttributes(many))).toBe(ErrorCode.VALIDATION_ERROR);
  });
});

describe('normalizeBarcodes', () => {
  it('normalizes whitespace', () => {
    expect(normalizeBarcodes([' 4600000 000017 '])).toEqual(['4600000000017']);
  });

  it('rejects invalid and duplicated codes', () => {
    expect(code(() => normalizeBarcodes(['штрих']))).toBe(ErrorCode.VALIDATION_ERROR);
    expect(code(() => normalizeBarcodes(['4600000000017', '4600000 000017']))).toBe(
      ErrorCode.DUPLICATE_BARCODE,
    );
  });
});
