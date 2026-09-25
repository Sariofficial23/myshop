import { HttpStatus } from '@nestjs/common';
import {
  ErrorCode,
  isValidSerialNumber,
  normalizeSerialNumber,
  type SerialType,
} from '@myshop/shared';
import { AppException } from '../common/errors/app.exception.js';

export interface ItemSerialsInput {
  variantId: string;
  quantity: number;
  serialNumbers: readonly string[];
  serialType: SerialType | null;
  productName: string;
}

/**
 * Проверка номеров строки прихода при проведении:
 *  - товар с учётом по номеру → номеров ровно столько, сколько единиц;
 *  - каждый номер корректен (IMEI — алгоритм Луна);
 *  - товар без учёта по номеру → номеров быть не должно.
 * Возвращает нормализованные номера.
 */
export function validateItemSerials(item: ItemSerialsInput): string[] {
  if (!item.serialType) {
    if (item.serialNumbers.length > 0) {
      throw new AppException(
        ErrorCode.SERIAL_NOT_ALLOWED,
        HttpStatus.BAD_REQUEST,
        `Product "${item.productName}" is not tracked by serial numbers`,
        { variantId: item.variantId },
      );
    }
    return [];
  }
  if (item.serialNumbers.length !== item.quantity) {
    throw new AppException(
      ErrorCode.SERIAL_COUNT_MISMATCH,
      HttpStatus.BAD_REQUEST,
      `Expected ${item.quantity} serial numbers for "${item.productName}", got ${item.serialNumbers.length}`,
      { variantId: item.variantId, expected: item.quantity, received: item.serialNumbers.length },
    );
  }
  const invalid = item.serialNumbers.filter(
    (value) => !isValidSerialNumber(item.serialType!, value),
  );
  if (invalid.length) {
    throw new AppException(
      item.serialType === 'IMEI' ? ErrorCode.INVALID_IMEI : ErrorCode.INVALID_SERIAL_NUMBER,
      HttpStatus.BAD_REQUEST,
      `Invalid ${item.serialType}`,
      { variantId: item.variantId, numbers: invalid },
    );
  }
  return item.serialNumbers.map((value) => normalizeSerialNumber(item.serialType!, value));
}

/** Один и тот же номер не может встречаться в документе дважды. */
export function assertNoDuplicateSerials(numbers: readonly string[]): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const number of numbers) {
    if (seen.has(number)) duplicates.add(number);
    seen.add(number);
  }
  if (duplicates.size) {
    throw new AppException(
      ErrorCode.DUPLICATE_IMEI,
      HttpStatus.CONFLICT,
      'Duplicate serial numbers',
      {
        numbers: [...duplicates],
      },
    );
  }
}
