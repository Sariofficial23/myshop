import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@myshop/shared';

/**
 * Бизнес-ошибка с машиночитаемым кодом. Бросайте её из сервисов:
 *
 *   throw new AppException(ErrorCode.INSUFFICIENT_STOCK, HttpStatus.CONFLICT, 'Not enough stock', { available: 2 });
 *
 * Фильтр AllExceptionsFilter превратит её в единый формат ApiErrorBody.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    status: HttpStatus,
    message: string = code,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }

  static notFound(code: ErrorCode = ErrorCode.NOT_FOUND, message = 'Resource not found') {
    return new AppException(code, HttpStatus.NOT_FOUND, message);
  }

  static conflict(code: ErrorCode, message: string, details?: unknown) {
    return new AppException(code, HttpStatus.CONFLICT, message, details);
  }

  static forbidden(message = 'Access denied') {
    return new AppException(ErrorCode.FORBIDDEN, HttpStatus.FORBIDDEN, message);
  }

  static unauthorized(message = 'Authentication required') {
    return new AppException(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED, message);
  }
}
