import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ErrorCode, type ApiErrorBody } from '@myshop/shared';
import type { Request, Response } from 'express';
import { Prisma } from '@myshop/database';
import { AppException } from './app.exception.js';

interface NormalizedError {
  status: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
}

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
};

/**
 * Нарушение unique-индекса → понятный пользователю код.
 * Имена индексов генерирует Prisma: <таблица>_<колонки>_key.
 */
const UNIQUE_CONSTRAINT_CODES: Record<string, ErrorCode> = {
  branches_company_id_name_key: ErrorCode.DUPLICATE_BRANCH_NAME,
  categories_company_id_name_key: ErrorCode.DUPLICATE_CATEGORY,
  brands_company_id_name_key: ErrorCode.DUPLICATE_BRAND,
  products_company_id_sku_key: ErrorCode.DUPLICATE_SKU,
  product_variants_company_id_sku_key: ErrorCode.DUPLICATE_SKU,
  barcodes_company_id_code_key: ErrorCode.DUPLICATE_BARCODE,
  serial_numbers_company_id_number_key: ErrorCode.DUPLICATE_IMEI,
  suppliers_company_id_name_key: ErrorCode.DUPLICATE_SUPPLIER,
  customers_company_id_phone_key: ErrorCode.DUPLICATE_CUSTOMER_PHONE,
  users_telegram_id_key: ErrorCode.TELEGRAM_ID_TAKEN,
  users_email_key: ErrorCode.EMAIL_TAKEN,
  companies_name_key_key: ErrorCode.DUPLICATE_COMPANY_NAME,
  memberships_company_id_login_key: ErrorCode.LOGIN_TAKEN,
};

/** Имя нарушенного unique-индекса (driver adapter) или список полей (классический движок). */
export function uniqueConstraintName(
  error: Prisma.PrismaClientKnownRequestError,
): string | undefined {
  const meta = error.meta as
    | { driverAdapterError?: { cause?: { constraint?: { index?: string } } }; target?: unknown }
    | undefined;
  const index = meta?.driverAdapterError?.cause?.constraint?.index;
  if (index) return index;
  return typeof meta?.target === 'string' ? meta.target : undefined;
}

export function normalizeException(exception: unknown): NormalizedError {
  if (exception instanceof AppException) {
    return {
      status: exception.getStatus(),
      code: exception.code,
      message: exception.message,
      details: exception.details,
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return {
      status,
      code:
        STATUS_TO_CODE[status] ??
        (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST),
      message: exception.message,
    };
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    switch (exception.code) {
      case 'P2002': {
        // unique constraint
        const constraint = uniqueConstraintName(exception);
        return {
          status: HttpStatus.CONFLICT,
          code:
            (constraint ? UNIQUE_CONSTRAINT_CODES[constraint] : undefined) ?? ErrorCode.CONFLICT,
          message: 'Unique constraint violation',
          details: constraint ? { constraint } : undefined,
        };
      }
      case 'P2025': // record not found
        return { status: HttpStatus.NOT_FOUND, code: ErrorCode.NOT_FOUND, message: 'Not found' };
      case 'P2003': // foreign key
        return {
          status: HttpStatus.CONFLICT,
          code: ErrorCode.CONFLICT,
          message: 'Related record constraint violation',
        };
    }
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: ErrorCode.INTERNAL_ERROR,
    // Не раскрываем внутренние детали клиенту
    message: 'Internal server error',
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const error = normalizeException(exception);

    if (error.status >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl} → ${error.status} ${error.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ApiErrorBody = {
      error: { code: error.code, message: error.message, details: error.details },
      statusCode: error.status,
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
      requestId: request.headers['x-request-id'] as string | undefined,
    };

    response.status(error.status).json(body);
  }
}
