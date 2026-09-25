import { HttpStatus } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorCode, normalizeSerialNumber, type SerialType } from '@myshop/shared';
import type { Prisma } from '@myshop/database';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import type { AuthContext } from '../../auth/auth-context.js';
import { AppException } from '../errors/app.exception.js';

type Db = Prisma.TransactionClient;

/** Строка складского документа: товар без номера — количество, с IMEI — список номеров. */
export class StockLineDto {
  @ApiProperty()
  @IsUUID()
  variantId: string;

  @ApiPropertyOptional({ example: 1, description: 'Для товаров с IMEI — по числу номеров' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  quantity?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  serialNumbers?: string[];
}

export interface StockLine {
  variantId: string;
  quantity: number;
  serialNumbers: string[];
  serialType: SerialType | null;
  productName: string;
}

const error = (code: ErrorCode, status: HttpStatus, message: string, details?: object) =>
  new AppException(code, status, message, details);

/**
 * Проверяет строки документа: варианты своей компании, без повторов, количество и номера.
 * allowZero — для инвентаризации (фактически 0 штук — это тоже результат подсчёта).
 */
export async function prepareStockLines(
  db: Db,
  ctx: AuthContext,
  items: readonly StockLineDto[],
  { allowZero = false } = {},
): Promise<StockLine[]> {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.variantId)) {
      throw error(ErrorCode.DUPLICATE_DOCUMENT_ITEM, HttpStatus.BAD_REQUEST, 'Duplicate item', {
        variantId: item.variantId,
      });
    }
    seen.add(item.variantId);
  }
  const variants = await db.productVariant.findMany({
    where: { id: { in: [...seen] }, companyId: ctx.companyId },
    select: { id: true, product: { select: { name: true, serialType: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  const allSerials = new Set<string>();

  return items.map((item) => {
    const variant = byId.get(item.variantId);
    if (!variant) {
      throw error(ErrorCode.VARIANT_NOT_FOUND, HttpStatus.NOT_FOUND, 'Variant not found', {
        variantId: item.variantId,
      });
    }
    const serialType = variant.product.serialType;
    if (!serialType) {
      if (item.serialNumbers?.length) {
        throw error(ErrorCode.SERIAL_NOT_ALLOWED, HttpStatus.BAD_REQUEST, 'No serials', {
          variantId: item.variantId,
        });
      }
      const quantity = item.quantity ?? (allowZero ? 0 : 1);
      if (quantity < (allowZero ? 0 : 1)) {
        throw error(
          ErrorCode.VALIDATION_ERROR,
          HttpStatus.BAD_REQUEST,
          'Quantity must be positive',
        );
      }
      return {
        variantId: item.variantId,
        quantity,
        serialNumbers: [],
        serialType,
        productName: variant.product.name,
      };
    }

    const serialNumbers = (item.serialNumbers ?? [])
      .map((n) => normalizeSerialNumber(serialType, n))
      .filter(Boolean);
    const duplicates = serialNumbers.filter((n) => {
      const dup = allSerials.has(n);
      allSerials.add(n);
      return dup;
    });
    if (duplicates.length) {
      throw error(ErrorCode.DUPLICATE_IMEI, HttpStatus.BAD_REQUEST, 'Duplicate serials', {
        numbers: duplicates,
      });
    }
    if (
      (serialNumbers.length === 0 && !allowZero) ||
      (item.quantity !== undefined && item.quantity !== serialNumbers.length)
    ) {
      throw error(
        ErrorCode.SERIAL_COUNT_MISMATCH,
        HttpStatus.BAD_REQUEST,
        'Serial count mismatch',
        {
          variantId: item.variantId,
          expected: item.quantity ?? 1,
          received: serialNumbers.length,
        },
      );
    }
    return {
      variantId: item.variantId,
      quantity: serialNumbers.length,
      serialNumbers,
      serialType,
      productName: variant.product.name,
    };
  });
}

/**
 * Забирает номера со склада филиала: все должны быть этого варианта, в этом филиале, IN_STOCK.
 * Обновление условное — если номер параллельно продан/перемещён, документ откатывается.
 */
export async function takeSerialsFromStock(
  tx: Db,
  ctx: AuthContext,
  input: {
    numbers: string[];
    variantId: string;
    branchId: string;
    data: Prisma.SerialNumberUncheckedUpdateManyInput;
  },
): Promise<void> {
  if (input.numbers.length === 0) return;
  const where = {
    companyId: ctx.companyId,
    number: { in: input.numbers },
    variantId: input.variantId,
    branchId: input.branchId,
    status: 'IN_STOCK' as const,
  };
  const found = await tx.serialNumber.findMany({ where, select: { number: true } });
  const missing = input.numbers.filter((n) => !found.some((f) => f.number === n));
  if (missing.length) {
    throw error(ErrorCode.SERIAL_NOT_IN_STOCK, HttpStatus.CONFLICT, 'Serials not in stock', {
      numbers: missing,
    });
  }
  const { count } = await tx.serialNumber.updateMany({ where, data: input.data });
  if (count !== input.numbers.length) {
    throw error(
      ErrorCode.SERIAL_NOT_IN_STOCK,
      HttpStatus.CONFLICT,
      'Serials changed concurrently',
      {
        numbers: input.numbers,
      },
    );
  }
}

export function endOfDay(date: string): Date {
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}
