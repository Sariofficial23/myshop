import { type ApiErrorBody, type ErrorCode, isErrorCode } from '@myshop/shared';

/** Коды ошибок, которые возникают только на клиенте. */
export type ClientErrorCode = ErrorCode | 'NETWORK_ERROR' | 'UNKNOWN';

export class ApiError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    readonly status: number,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static fromBody(status: number, body: unknown): ApiError {
    if (isApiErrorBody(body)) {
      return new ApiError(
        body.error.code,
        status,
        body.error.message,
        body.error.details,
        body.requestId,
      );
    }
    return new ApiError('UNKNOWN', status, `Unexpected error response (HTTP ${status})`);
  }
}

function isApiErrorBody(body: unknown): body is ApiErrorBody {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false;
  const error = (body as { error: unknown }).error;
  return (
    typeof error === 'object' && error !== null && isErrorCode((error as { code?: unknown }).code)
  );
}

/**
 * Ключ перевода для ошибки: `errors.<CODE>`.
 * Использование: t(errorMessageKey(error)) с namespace корня сообщений.
 */
export function errorMessageKey(error: unknown): `errors.${ClientErrorCode}` {
  return `errors.${error instanceof ApiError ? error.code : 'UNKNOWN'}`;
}
