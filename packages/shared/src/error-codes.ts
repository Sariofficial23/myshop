/**
 * Машиночитаемые коды ошибок API.
 * Backend всегда отвечает кодом из этого списка, frontend переводит код
 * в понятное пользователю сообщение (см. apps/web/src/i18n/locales/*).
 */
export const ErrorCode = {
  // Общие
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // Доступ
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',

  // Товары и склад
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',

  // IMEI
  IMEI_NOT_FOUND: 'IMEI_NOT_FOUND',
  IMEI_ALREADY_SOLD: 'IMEI_ALREADY_SOLD',
  DUPLICATE_IMEI: 'DUPLICATE_IMEI',

  // Продажи и возвраты
  SALE_NOT_FOUND: 'SALE_NOT_FOUND',
  RETURN_LIMIT_EXCEEDED: 'RETURN_LIMIT_EXCEEDED',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ERROR_CODES: readonly ErrorCode[] = Object.values(ErrorCode);

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}
