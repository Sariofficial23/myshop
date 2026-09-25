import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  DocumentPrefix,
  ErrorCode,
  formatDocumentNumber,
  normalizeSerialNumber,
  PAYMENT_METHODS,
  type PaymentMethod,
  Permission,
} from '@myshop/shared';
import { Prisma } from '@myshop/database';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  accessibleBranchWhere,
  assertBranchAccess,
  type AuthContext,
} from '../auth/auth-context.js';
import { AuditService } from '../audit/audit.service.js';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { nextDocumentNumber } from '../common/documents/document-number.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StockService } from '../stock/stock.service.js';
import { refundAmount } from './return-calc.js';

const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class ReturnItemDto {
  @ApiProperty({ description: 'Строка чека' })
  @IsUUID()
  saleItemId: string;

  @ApiPropertyOptional({ example: 1, description: 'Для товаров с IMEI — по числу номеров' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  serialNumbers?: string[];
}

export class CreateReturnDto {
  @ApiProperty()
  @IsUUID()
  saleId: string;

  @ApiProperty({ type: [ReturnItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items: ReturnItemDto[];

  @ApiProperty({ enum: PAYMENT_METHODS, description: 'Как возвращаются деньги клиенту' })
  @IsIn(PAYMENT_METHODS)
  refundMethod: PaymentMethod;

  @ApiPropertyOptional({ example: 'Не подошёл цвет' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  reason?: string | null;
}

export class ListReturnsQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  saleId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

const returnInclude = {
  branch: { select: { id: true, name: true } },
  sale: { select: { id: true, number: true, customer: { select: { id: true, name: true } } } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  refunds: { orderBy: { createdAt: 'asc' } },
  items: {
    orderBy: { id: 'asc' },
    include: {
      variant: {
        select: {
          id: true,
          sku: true,
          name: true,
          product: { select: { id: true, name: true, serialType: true } },
        },
      },
    },
  },
} satisfies Prisma.SaleReturnInclude;
type ReturnWithRelations = Prisma.SaleReturnGetPayload<{ include: typeof returnInclude }>;

const toResponse = (r: ReturnWithRelations, showCost: boolean) => ({
  ...r,
  displayNumber: formatDocumentNumber(DocumentPrefix.RETURN, r.number),
  sale: { ...r.sale, displayNumber: formatDocumentNumber(DocumentPrefix.SALE, r.sale.number) },
  refundTotal: r.refundTotal.toFixed(2),
  debtReduction: r.debtReduction.toFixed(2),
  costTotal: showCost ? r.costTotal.toFixed(2) : undefined,
  refunds: r.refunds.map((p) => ({ ...p, amount: p.amount.toFixed(2) })),
  items: r.items.map(({ unitCost, ...item }) => ({
    ...item,
    amount: item.amount.toFixed(2),
    unitCost: showCost ? unitCost.toFixed(2) : undefined,
  })),
});

const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };

const fail = (code: ErrorCode, status: HttpStatus, message: string, details?: object) =>
  new AppException(code, status, message, details);

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: AuthContext, query: ListReturnsQuery) {
    if (query.branchId) assertBranchAccess(ctx, query.branchId);
    const page = query.page ?? 1;
    const pageSize = 30;
    const where: Prisma.SaleReturnWhereInput = {
      companyId: ctx.companyId,
      branch: accessibleBranchWhere(ctx),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.saleId ? { saleId: query.saleId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.saleReturn.findMany({
        where,
        include: returnInclude,
        orderBy: [{ date: 'desc' }, { number: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.saleReturn.count({ where }),
    ]);
    const showCost = ctx.permissions.has(Permission.REPORTS_VIEW);
    return { items: items.map((r) => toResponse(r, showCost)), total, page, pageSize };
  }

  async get(ctx: AuthContext, id: string) {
    const found = await this.prisma.saleReturn.findFirst({
      where: { id, companyId: ctx.companyId },
      include: returnInclude,
    });
    if (!found) throw fail(ErrorCode.RETURN_NOT_FOUND, HttpStatus.NOT_FOUND, 'Return not found');
    assertBranchAccess(ctx, found.branchId);
    return toResponse(found, ctx.permissions.has(Permission.REPORTS_VIEW));
  }

  /**
   * Возврат — одна транзакция:
   *  1. строки чека блокируются (SELECT … FOR UPDATE) — два параллельных возврата не превысят проданное;
   *  2. вернуть можно не больше, чем продано минус уже возвращённое (RETURN_LIMIT_EXCEEDED);
   *  3. IMEI должен быть продан именно этой строкой чека; он снова становится IN_STOCK;
   *  4. StockMovement RETURN по себестоимости продажи, выплата клиенту, статус продажи, аудит.
   */
  async create(ctx: AuthContext, dto: CreateReturnDto) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: dto.saleId, companyId: ctx.companyId },
      select: { id: true, branchId: true, number: true },
    });
    if (!sale) throw fail(ErrorCode.SALE_NOT_FOUND, HttpStatus.NOT_FOUND, 'Sale not found');
    assertBranchAccess(ctx, sale.branchId);
    const ids = dto.items.map((i) => i.saleItemId);
    if (new Set(ids).size !== ids.length) {
      throw fail(ErrorCode.DUPLICATE_DOCUMENT_ITEM, HttpStatus.BAD_REQUEST, 'Duplicate item');
    }

    const id = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM sale_items WHERE sale_id = ${sale.id}::uuid FOR UPDATE`;
      const saleItems = await tx.saleItem.findMany({
        where: { saleId: sale.id },
        include: {
          variant: { select: { product: { select: { serialType: true } } } },
          serialNumbers: { where: { status: 'SOLD' }, select: { number: true } },
        },
      });
      const byId = new Map(saleItems.map((item) => [item.id, item]));

      const lines = dto.items.map((input) => {
        const item = byId.get(input.saleItemId);
        if (!item) {
          throw fail(ErrorCode.SALE_ITEM_NOT_FOUND, HttpStatus.NOT_FOUND, 'Sale item not found', {
            saleItemId: input.saleItemId,
          });
        }
        const serialType = item.variant.product.serialType;
        let serials: string[] = [];
        if (serialType) {
          serials = [
            ...new Set(
              (input.serialNumbers ?? []).map((n) => normalizeSerialNumber(serialType, n)),
            ),
          ].filter(Boolean);
          const sold = new Set(item.serialNumbers.map((s) => s.number));
          const foreign = serials.filter((n) => !sold.has(n));
          if (foreign.length) {
            throw fail(ErrorCode.IMEI_NOT_FOUND, HttpStatus.NOT_FOUND, 'Serial not in this sale', {
              numbers: foreign,
            });
          }
          if (serials.length === 0 || (input.quantity && input.quantity !== serials.length)) {
            throw fail(ErrorCode.SERIAL_COUNT_MISMATCH, HttpStatus.BAD_REQUEST, 'Select serials', {
              saleItemId: item.id,
              received: serials.length,
            });
          }
        } else if (input.serialNumbers?.length) {
          throw fail(ErrorCode.SERIAL_NOT_ALLOWED, HttpStatus.BAD_REQUEST, 'No serials');
        }
        const quantity = serialType ? serials.length : (input.quantity ?? 1);
        const available = item.quantity - item.returnedQuantity;
        if (quantity > available) {
          throw fail(ErrorCode.RETURN_LIMIT_EXCEEDED, HttpStatus.CONFLICT, 'Return limit', {
            saleItemId: item.id,
            available,
            requested: quantity,
          });
        }
        return { item, quantity, serials, amount: refundAmount(item, quantity) };
      });

      const refundTotal = lines.reduce((sum, l) => sum.add(l.amount), new Prisma.Decimal(0));
      const costTotal = lines.reduce(
        (sum, l) => sum.add(l.item.unitCost.mul(l.quantity)),
        new Prisma.Decimal(0),
      );
      // Продажа в рассрочку: возврат сначала гасит оставшийся долг, деньгами — только остальное
      await tx.$queryRaw`SELECT id FROM installments WHERE sale_id = ${sale.id}::uuid FOR UPDATE`;
      const installment = await tx.installment.findUnique({ where: { saleId: sale.id } });
      const debt = installment
        ? installment.total.sub(installment.paidAmount).sub(installment.reducedAmount)
        : new Prisma.Decimal(0);
      const debtReduction = Prisma.Decimal.min(refundTotal, debt);
      const cashRefund = refundTotal.sub(debtReduction);

      const number = await nextDocumentNumber(tx, ctx.companyId, 'RETURN');
      const created = await tx.saleReturn.create({
        data: {
          companyId: ctx.companyId,
          branchId: sale.branchId,
          saleId: sale.id,
          number,
          reason: dto.reason ?? null,
          refundTotal,
          debtReduction,
          costTotal: costTotal.toDecimalPlaces(2),
          createdById: ctx.userId,
          ...(cashRefund.greaterThan(0)
            ? {
                refunds: {
                  create: {
                    companyId: ctx.companyId,
                    method: dto.refundMethod,
                    amount: cashRefund,
                    paidById: ctx.userId,
                  },
                },
              }
            : {}),
        },
      });

      for (const line of lines) {
        await this.stock.applyMovement(tx, ctx, {
          branchId: sale.branchId,
          variantId: line.item.variantId,
          type: 'RETURN',
          quantity: line.quantity,
          unitCost: line.item.unitCost,
          returnId: created.id,
        });
        if (line.serials.length) {
          const { count } = await tx.serialNumber.updateMany({
            where: {
              companyId: ctx.companyId,
              number: { in: line.serials },
              saleItemId: line.item.id,
              status: 'SOLD',
            },
            // Связь с чеком остаётся до следующей продажи — в чеке видно, что номер возвращён
            data: { status: 'IN_STOCK', warrantyStart: null, warrantyEnd: null },
          });
          if (count !== line.serials.length) {
            throw fail(ErrorCode.IMEI_NOT_FOUND, HttpStatus.CONFLICT, 'Serial changed', {
              numbers: line.serials,
            });
          }
        }
        await tx.returnItem.create({
          data: {
            returnId: created.id,
            saleItemId: line.item.id,
            variantId: line.item.variantId,
            quantity: line.quantity,
            amount: line.amount,
            unitCost: line.item.unitCost,
            serialNumbers: line.serials,
          },
        });
        await tx.saleItem.update({
          where: { id: line.item.id },
          data: {
            returnedQuantity: { increment: line.quantity },
            refundedAmount: { increment: line.amount },
          },
        });
      }

      if (installment && debtReduction.greaterThan(0)) {
        await tx.installment.update({
          where: { id: installment.id },
          data: {
            reducedAmount: { increment: debtReduction },
            ...(debtReduction.equals(debt) ? { status: 'PAID' } : {}),
          },
        });
      }

      const returnedAll = saleItems.every((item) => {
        const line = lines.find((l) => l.item.id === item.id);
        return item.returnedQuantity + (line?.quantity ?? 0) === item.quantity;
      });
      await tx.sale.update({
        where: { id: sale.id },
        data: { status: returnedAll ? 'RETURNED' : 'PARTIALLY_RETURNED' },
      });
      await this.audit.log(tx, ctx, {
        action: 'RETURN',
        entity: 'SaleReturn',
        entityId: created.id,
        newValue: {
          number,
          saleId: sale.id,
          saleNumber: sale.number,
          refundTotal: refundTotal.toFixed(2),
          debtReduction: debtReduction.toFixed(2),
          refundMethod: dto.refundMethod,
          items: lines.map((l) => ({
            saleItemId: l.item.id,
            quantity: l.quantity,
            serials: l.serials,
          })),
        },
      });
      return created.id;
    }, TX_OPTIONS);
    return this.get(ctx, id);
  }
}

@ApiTags('returns')
@ApiBearerAuth()
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  @RequirePermissions(Permission.SALES_VIEW)
  @ApiOperation({ summary: 'Возвраты' })
  list(@CurrentAuth() ctx: AuthContext, @Query() query: ListReturnsQuery) {
    return this.returns.list(ctx, query);
  }

  @Get(':id')
  @RequirePermissions(Permission.SALES_VIEW)
  @ApiOperation({ summary: 'Возврат' })
  get(@CurrentAuth() ctx: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.returns.get(ctx, id);
  }

  @Post()
  @RequirePermissions(Permission.RETURNS_CREATE)
  @ApiOperation({ summary: 'Оформить возврат по продаже: товар на склад, IMEI в наличии, выплата' })
  create(@CurrentAuth() ctx: AuthContext, @Body() dto: CreateReturnDto) {
    return this.returns.create(ctx, dto);
  }
}

@Module({ controllers: [ReturnsController], providers: [ReturnsService] })
export class ReturnsModule {}
