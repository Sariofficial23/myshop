import { HttpStatus } from '@nestjs/common';
import { ErrorCode, isValidBarcode, normalizeBarcode } from '@myshop/shared';
import { AppException } from '../common/errors/app.exception.js';

const MAX_ATTRIBUTES = 20;

/** Характеристики варианта: до 20 пар "строка → строка" разумной длины. */
export function validateAttributes(attributes: unknown): Record<string, string> {
  if (attributes === undefined || attributes === null) return {};
  const entries = Object.entries(attributes as Record<string, unknown>);
  const valid =
    entries.length <= MAX_ATTRIBUTES &&
    entries.every(
      ([key, value]) =>
        key.length > 0 && key.length <= 50 && typeof value === 'string' && value.length <= 200,
    );
  if (!valid) {
    throw new AppException(
      ErrorCode.VALIDATION_ERROR,
      HttpStatus.BAD_REQUEST,
      'Invalid attributes',
      [{ field: 'attributes', constraints: { attributes: 'max 20 string values' } }],
    );
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

/** Нормализует штрихкоды и проверяет, что в одном запросе нет повторов. */
export function normalizeBarcodes(codes: readonly string[]): string[] {
  const normalized = codes.map(normalizeBarcode);
  for (const code of normalized) {
    if (!isValidBarcode(code)) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Invalid barcode',
        [{ field: 'barcodes', constraints: { barcode: `invalid barcode: ${code}` } }],
      );
    }
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new AppException(
      ErrorCode.DUPLICATE_BARCODE,
      HttpStatus.CONFLICT,
      'Duplicate barcode in request',
    );
  }
  return normalized;
}
