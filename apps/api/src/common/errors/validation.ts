import { HttpStatus, type ValidationError } from '@nestjs/common';
import { ErrorCode } from '@myshop/shared';
import { AppException } from './app.exception.js';

export interface FieldError {
  field: string;
  constraints: Record<string, string>;
}

/** Разворачивает вложенные ошибки class-validator в плоский список "path → constraints". */
export function flattenValidationErrors(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints ? [{ field, constraints: error.constraints }] : [];
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}

export function validationExceptionFactory(errors: ValidationError[]): AppException {
  return new AppException(
    ErrorCode.VALIDATION_ERROR,
    HttpStatus.BAD_REQUEST,
    'Validation failed',
    flattenValidationErrors(errors),
  );
}
