import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, isValidSerialNumber, normalizeSerialNumber, SerialType } from '@myshop/shared';
import {
  accessibleBranchWhere,
  assertBranchAccess,
  canAccessBranch,
  type AuthContext,
} from '../auth/auth-context.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { notFound } from './catalog.errors.js';

const serialInclude = {
  branch: { select: { id: true, name: true } },
  sale: { select: { id: true, number: true, date: true } },
  variant: {
    select: {
      id: true,
      sku: true,
      name: true,
      product: { select: { id: true, name: true, serialType: true } },
    },
  },
} as const;

@Injectable()
export class SerialNumbersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Проверка номера перед приходом: корректный ли формат (IMEI — алгоритм Луна)
   * и нет ли его уже в компании (защита от дублей).
   */
  async check(ctx: AuthContext, rawNumber: string, type: SerialType = SerialType.IMEI) {
    const number = normalizeSerialNumber(type, rawNumber);
    const valid = isValidSerialNumber(type, rawNumber);
    const existing = valid
      ? await this.prisma.serialNumber.findUnique({
          where: { companyId_number: { companyId: ctx.companyId, number } },
          select: { status: true },
        })
      : null;
    return { number, type, valid, exists: existing !== null, status: existing?.status ?? null };
  }

  /** Быстрый поиск по IMEI / серийному номеру: где единица, её статус и товар. */
  async find(ctx: AuthContext, rawNumber: string) {
    const candidates = [
      ...new Set([
        normalizeSerialNumber('IMEI', rawNumber),
        normalizeSerialNumber('SERIAL', rawNumber),
      ]),
    ];
    const serial = await this.prisma.serialNumber.findFirst({
      where: { companyId: ctx.companyId, number: { in: candidates } },
      include: serialInclude,
    });
    if (!serial || !canAccessBranch(ctx, serial.branchId)) {
      throw notFound(ErrorCode.IMEI_NOT_FOUND, 'IMEI / serial number not found');
    }
    return serial;
  }

  /** IMEI варианта в наличии в доступных филиалах — выбор конкретной единицы при продаже. */
  inStock(ctx: AuthContext, variantId: string, branchId?: string) {
    if (branchId) assertBranchAccess(ctx, branchId);
    return this.prisma.serialNumber.findMany({
      where: {
        companyId: ctx.companyId,
        variantId,
        status: 'IN_STOCK',
        branch: accessibleBranchWhere(ctx),
        ...(branchId ? { branchId } : {}),
      },
      select: { id: true, number: true, type: true, branch: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
  }

  /** Бросает INVALID_IMEI / INVALID_SERIAL_NUMBER. Используется документами прихода (этап 4). */
  static assertValid(type: SerialType, value: string): string {
    if (!isValidSerialNumber(type, value)) {
      throw new AppException(
        type === SerialType.IMEI ? ErrorCode.INVALID_IMEI : ErrorCode.INVALID_SERIAL_NUMBER,
        HttpStatus.BAD_REQUEST,
        `Invalid ${type}: ${value}`,
      );
    }
    return normalizeSerialNumber(type, value);
  }
}
