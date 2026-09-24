import { ForbiddenException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ErrorCode } from '@myshop/shared';
import { describe, expect, it } from 'vitest';
import { Prisma } from '@myshop/database';
import { AppException } from './app.exception.js';
import { normalizeException } from './all-exceptions.filter.js';

describe('normalizeException', () => {
  it('keeps business error code, status and details', () => {
    const result = normalizeException(
      AppException.conflict(ErrorCode.INSUFFICIENT_STOCK, 'Not enough stock', { available: 1 }),
    );
    expect(result).toEqual({
      status: HttpStatus.CONFLICT,
      code: ErrorCode.INSUFFICIENT_STOCK,
      message: 'Not enough stock',
      details: { available: 1 },
    });
  });

  it('maps built-in Nest HTTP exceptions to generic codes', () => {
    expect(normalizeException(new ForbiddenException()).code).toBe(ErrorCode.FORBIDDEN);
    expect(normalizeException(new NotFoundException()).code).toBe(ErrorCode.NOT_FOUND);
    expect(normalizeException(new ThrottlerException()).code).toBe(ErrorCode.RATE_LIMITED);
  });

  it('maps Prisma unique constraint violation to 409 CONFLICT', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['company_id', 'name'] },
    });
    expect(normalizeException(error)).toMatchObject({
      status: HttpStatus.CONFLICT,
      code: ErrorCode.CONFLICT,
    });
  });

  it('hides unknown errors behind INTERNAL_ERROR', () => {
    const result = normalizeException(new Error('connection string leaked: postgres://secret'));
    expect(result.status).toBe(500);
    expect(result.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(result.message).not.toContain('secret');
  });
});
