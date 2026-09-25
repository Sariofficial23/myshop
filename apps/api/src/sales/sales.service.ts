import { HttpStatus, Injectable } from '@nestjs/common';
import {
  DocumentPrefix,
  ErrorCode,
  formatDocumentNumber,
  normalizeSerialNumber,
  paymentTypeOf,
  Permission,
} from '@myshop/shared';
import { Prisma } from '@myshop/database';
import {
  accessibleBranchWhere,
  assertBranchAccess,
  type AuthContext,
  hasPermission,
} from '../auth/auth-context.js';
import { AuditService } from '../audit/audit.service.js';
import { nextDocumentNumber } from '../common/documents/document-number.js';
import { AppException } from '../common/errors/app.exception.js';
import { CustomersService } from '../customers/customers.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StockService } from '../stock/stock.service.js';
import { monthlyAmount } from '../installments/installment-calc.js';
import { addMonths, calculateLines, validatePayments } from './sale-calc.js';
import type { CreateSaleDto, ListSalesQuery, SaleItemDto } from './sales.dto.js';

type Tx = Prisma.TransactionClient;

const person = { select: { id: true, firstName: true, lastName: true } } as const;

const saleInclude = {
  // Адрес и телефон филиала печатаются в шапке чека
  branch: { select: { id: true, name: true, address: true, phone: true } },
  customer: { select: { id: true, name: true, phone: true } },
  seller: person,
  payments: { orderBy: { createdAt: 'asc' } },
  installment: {
    select: {
      id: true,
      total: true,
      paidAmount: true,
      reducedAmount: true,
      months: true,
      status: true,
    },
  },
  returns: {
    orderBy: { createdAt: 'asc' },
    select: { id: true, number: true, date: true, refundTotal: true, costTotal: true },
  },
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      variant: {
        select: {
          id: true,
          sku: true,
          name: true,
          product: { select: { id: true, name: true, serialType: true, warrantyMonths: true } },
        },
      },
      serialNumbers: {
        select: { id: true, number: true, type: true, status: true, warrantyEnd: true },
      },
    },
  },
} satisfies Prisma.SaleInclude;

type SaleWithRelations = Prisma.SaleGetPayload<{ include: typeof saleInclude }>;

/** Себестоимость и прибыль видят только те, кому доступны отчёты. */
function toResponse(sale: SaleWithRelations, ctx: AuthContext) {
  const showCost = hasPermission(ctx, Permission.REPORTS_VIEW);
  const refunded = sale.returns.reduce((sum, r) => sum.add(r.refundTotal), new Prisma.Decimal(0));
  const returnedCost = sale.returns.reduce((sum, r) => sum.add(r.costTotal), new Prisma.Decimal(0));
  return {
    ...sale,
    displayNumber: formatDocumentNumber(DocumentPrefix.SALE, sale.number),
    subtotal: sale.subtotal.toFixed(2),
    discountTotal: sale.discountTotal.toFixed(2),
    total: sale.total.toFixed(2),
    paidTotal: sale.paidTotal.toFixed(2),
    refundedTotal: refunded.toFixed(2),
    installment: sale.installment
      ? {
          ...sale.installment,
          total: sale.installment.total.toFixed(2),
          paidAmount: sale.installment.paidAmount.toFixed(2),
          reducedAmount: sale.installment.reducedAmount.toFixed(2),
          remaining: sale.installment.total
            .sub(sale.installment.paidAmount)
            .sub(sale.installment.reducedAmount)
            .toFixed(2),
        }
      : null,
    costTotal: showCost ? sale.costTotal.toFixed(2) : undefined,
    // Прибыль за вычетом возвратов: (выручка − возвращено) − (себестоимость − себестоимость возвратов)
    grossProfit: showCost
      ? sale.total.sub(refunded).sub(sale.costTotal.sub(returnedCost)).toFixed(2)
      : undefined,
    payments: sale.payments.map((p) => ({ ...p, amount: p.amount.toFixed(2) })),
    returns: sale.returns.map(({ costTotal: _cost, ...r }) => ({
      ...r,
      displayNumber: formatDocumentNumber(DocumentPrefix.RETURN, r.number),
      refundTotal: r.refundTotal.toFixed(2),
    })),
    items: sale.items.map(({ unitCost, ...item }) => ({
      ...item,
      price: item.price.toFixed(2),
      discount: item.discount.toFixed(2),
      total: item.total.toFixed(2),
      refundedAmount: item.refundedAmount.toFixed(2),
      unitCost: showCost ? unitCost.toFixed(2) : undefined,
    })),
  };
}

const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };

const imeiError = (code: ErrorCode, message: string, numbers: string[]) =>
  new AppException(
    code,
    code === ErrorCode.IMEI_ALREADY_SOLD ? HttpStatus.CONFLICT : HttpStatus.NOT_FOUND,
    message,
    {
      numbers,
    },
  );

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly customers: CustomersService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: AuthContext, query: ListSalesQuery) {
    if (query.branchId) assertBranchAccess(ctx, query.branchId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const where: Prisma.SaleWhereInput = {
      companyId: ctx.companyId,
      branch: accessibleBranchWhere(ctx),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.sellerId ? { sellerId: query.sellerId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: endOfDay(query.to) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        include: saleInclude,
        orderBy: [{ date: 'desc' }, { number: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.sale.count({ where }),
    ]);
    return { items: items.map((s) => toResponse(s, ctx)), total, page, pageSize };
  }

  async get(ctx: AuthContext, id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, companyId: ctx.companyId },
      include: saleInclude,
    });
    if (!sale)
      throw new AppException(ErrorCode.SALE_NOT_FOUND, HttpStatus.NOT_FOUND, 'Sale not found');
    assertBranchAccess(ctx, sale.branchId);
    return toResponse(sale, ctx);
  }

  /**
   * Продажа — одна транзакция:
   *  1. проверка филиала, клиента, товаров, цен и скидок;
   *  2. IMEI: существует, этого варианта, в этом филиале, IN_STOCK → SOLD (условно — второй раз продать нельзя);
   *  3. StockMovement SALE (остаток не уходит в минус), себестоимость на момент продажи;
   *  4. Sale, SaleItem, Payment (сумма платежей = сумма к оплате);
   *  5. гарантия по IMEI, запись в журнал аудита.
   */
  async create(ctx: AuthContext, dto: CreateSaleDto) {
    assertBranchAccess(ctx, dto.branchId);
    const branch = await this.prisma.branch.count({
      where: { id: dto.branchId, companyId: ctx.companyId, isActive: true },
    });
    if (!branch)
      throw new AppException(ErrorCode.BRANCH_NOT_FOUND, HttpStatus.NOT_FOUND, 'Branch not found');
    if (dto.customerId) await this.customers.assertInCompany(ctx, dto.customerId);
    if (dto.installment && !dto.customerId) {
      // Рассрочка — это долг конкретного клиента
      throw new AppException(
        ErrorCode.CUSTOMER_REQUIRED,
        HttpStatus.BAD_REQUEST,
        'Customer is required for an installment sale',
      );
    }

    const prepared = await this.prepareItems(ctx, dto.items);
    const calc = calculateLines(prepared);
    const { payments, paid } = validatePayments(calc.total, dto.payments, {
      partial: Boolean(dto.installment),
    });
    const now = new Date();

    const id = await this.prisma.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, ctx.companyId, 'SALE');
      const sale = await tx.sale.create({
        data: {
          companyId: ctx.companyId,
          branchId: dto.branchId,
          customerId: dto.customerId ?? null,
          sellerId: ctx.userId,
          number,
          date: now,
          paymentType: dto.installment
            ? 'INSTALLMENT'
            : paymentTypeOf(payments.map((p) => p.method)),
          subtotal: calc.subtotal,
          discountTotal: calc.discountTotal,
          total: calc.total,
          paidTotal: paid,
          notes: dto.notes ?? null,
          payments: {
            create: payments.map((p) => ({
              companyId: ctx.companyId,
              method: p.method,
              amount: p.amount,
              receivedById: ctx.userId,
            })),
          },
        },
      });

      let costTotal = new Prisma.Decimal(0);
      for (const [index, item] of prepared.entries()) {
        const line = calc.lines[index]!;
        const movement = await this.stock.applyMovement(tx, ctx, {
          branchId: dto.branchId,
          variantId: item.variantId,
          type: 'SALE',
          quantity: -item.quantity,
          saleId: sale.id,
        });
        const unitCost = movement.unitCost ?? new Prisma.Decimal(0);
        costTotal = costTotal.add(unitCost.mul(item.quantity));

        const saleItem = await tx.saleItem.create({
          data: {
            saleId: sale.id,
            variantId: item.variantId,
            quantity: item.quantity,
            price: line.price,
            discount: line.discount,
            total: line.total,
            unitCost,
          },
        });

        if (item.serialNumbers.length) {
          await this.sellSerials(tx, ctx, {
            numbers: item.serialNumbers,
            variantId: item.variantId,
            branchId: dto.branchId,
            saleId: sale.id,
            saleItemId: saleItem.id,
            warrantyMonths: item.warrantyMonths,
            now,
          });
        }
      }

      await tx.sale.update({
        where: { id: sale.id },
        data: { costTotal: costTotal.toDecimalPlaces(2) },
      });
      if (dto.installment) {
        const debt = calc.total.sub(paid);
        await tx.installment.create({
          data: {
            companyId: ctx.companyId,
            branchId: dto.branchId,
            saleId: sale.id,
            customerId: dto.customerId!,
            total: debt,
            months: dto.installment.months,
            monthlyAmount: monthlyAmount(debt, dto.installment.months),
            firstDueDate: dto.installment.firstDueDate
              ? new Date(dto.installment.firstDueDate)
              : dateOnly(addMonths(now, 1)),
          },
        });
      }
      await this.audit.log(tx, ctx, {
        action: 'SALE',
        entity: 'Sale',
        entityId: sale.id,
        newValue: {
          number,
          branchId: dto.branchId,
          total: calc.total.toFixed(2),
          payments: payments.map((p) => ({ method: p.method, amount: p.amount.toFixed(2) })),
          installment: dto.installment
            ? { months: dto.installment.months, debt: calc.total.sub(paid).toFixed(2) }
            : undefined,
          items: prepared.map((i) => ({
            variantId: i.variantId,
            quantity: i.quantity,
            serials: i.serialNumbers,
          })),
        },
      });
      return sale.id;
    }, TX_OPTIONS);

    return this.get(ctx, id);
  }

  /**
   * IMEI → SOLD. Условное обновление (status = IN_STOCK) атомарно: если параллельная продажа
   * уже забрала номер, обновится меньше строк — вся продажа откатится с IMEI_ALREADY_SOLD.
   */
  private async sellSerials(
    tx: Tx,
    ctx: AuthContext,
    input: {
      numbers: string[];
      variantId: string;
      branchId: string;
      saleId: string;
      saleItemId: string;
      warrantyMonths: number;
      now: Date;
    },
  ) {
    const found = await tx.serialNumber.findMany({
      where: { companyId: ctx.companyId, number: { in: input.numbers } },
      select: { number: true, status: true, variantId: true, branchId: true },
    });
    const byNumber = new Map(found.map((s) => [s.number, s]));
    const missing = input.numbers.filter((n) => {
      const s = byNumber.get(n);
      return !s || s.variantId !== input.variantId || s.branchId !== input.branchId;
    });
    if (missing.length)
      throw imeiError(
        ErrorCode.IMEI_NOT_FOUND,
        'IMEI not found in this branch for this product',
        missing,
      );
    const sold = input.numbers.filter((n) => byNumber.get(n)!.status !== 'IN_STOCK');
    if (sold.length) throw imeiError(ErrorCode.IMEI_ALREADY_SOLD, 'IMEI already sold', sold);

    const { count } = await tx.serialNumber.updateMany({
      where: {
        companyId: ctx.companyId,
        number: { in: input.numbers },
        variantId: input.variantId,
        branchId: input.branchId,
        status: 'IN_STOCK',
      },
      data: {
        status: 'SOLD',
        saleId: input.saleId,
        saleItemId: input.saleItemId,
        warrantyStart: input.warrantyMonths > 0 ? input.now : null,
        warrantyEnd: input.warrantyMonths > 0 ? addMonths(input.now, input.warrantyMonths) : null,
      },
    });
    if (count !== input.numbers.length) {
      throw imeiError(ErrorCode.IMEI_ALREADY_SOLD, 'IMEI was sold concurrently', input.numbers);
    }
  }

  /** Товары, цены, количество по IMEI. Изменить цену может только тот, кто управляет товарами. */
  private async prepareItems(ctx: AuthContext, items: SaleItemDto[]) {
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: [...new Set(items.map((i) => i.variantId))] }, companyId: ctx.companyId },
      include: {
        product: { select: { name: true, isActive: true, serialType: true, warrantyMonths: true } },
      },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));
    const canChangePrice = hasPermission(ctx, Permission.PRODUCTS_MANAGE);
    const allSerials: string[] = [];

    const prepared = items.map((item) => {
      const variant = byId.get(item.variantId);
      if (!variant) {
        throw new AppException(
          ErrorCode.VARIANT_NOT_FOUND,
          HttpStatus.NOT_FOUND,
          'Variant not found',
          {
            variantId: item.variantId,
          },
        );
      }
      if (!variant.isActive || !variant.product.isActive) {
        throw new AppException(
          ErrorCode.PRODUCT_INACTIVE,
          HttpStatus.BAD_REQUEST,
          'Product is not active',
          {
            variantId: item.variantId,
          },
        );
      }

      const serialType = variant.product.serialType;
      const serialNumbers = serialType
        ? (item.serialNumbers ?? [])
            .map((n) => normalizeSerialNumber(serialType, n))
            .filter(Boolean)
        : [];
      if (!serialType && item.serialNumbers?.length) {
        throw new AppException(
          ErrorCode.SERIAL_NOT_ALLOWED,
          HttpStatus.BAD_REQUEST,
          'Product has no serial numbers',
          {
            variantId: item.variantId,
          },
        );
      }
      if (serialType && serialNumbers.length === 0) {
        throw new AppException(
          ErrorCode.SERIAL_COUNT_MISMATCH,
          HttpStatus.BAD_REQUEST,
          'Select IMEI / serial numbers',
          {
            variantId: item.variantId,
            expected: item.quantity ?? 1,
            received: 0,
          },
        );
      }
      if (serialType && item.quantity !== undefined && item.quantity !== serialNumbers.length) {
        throw new AppException(
          ErrorCode.SERIAL_COUNT_MISMATCH,
          HttpStatus.BAD_REQUEST,
          'Quantity must match IMEI count',
          {
            variantId: item.variantId,
            expected: item.quantity,
            received: serialNumbers.length,
          },
        );
      }
      allSerials.push(...serialNumbers);

      const listPrice = variant.salePrice;
      let price: Prisma.Decimal;
      if (item.price) {
        price = new Prisma.Decimal(item.price);
        if (listPrice && !price.equals(listPrice) && !canChangePrice) {
          throw new AppException(
            ErrorCode.PRICE_CHANGE_FORBIDDEN,
            HttpStatus.FORBIDDEN,
            'Only managers can change the price',
            {
              variantId: item.variantId,
            },
          );
        }
      } else if (listPrice) {
        price = listPrice;
      } else {
        throw new AppException(
          ErrorCode.PRICE_REQUIRED,
          HttpStatus.BAD_REQUEST,
          'Product has no sale price',
          {
            variantId: item.variantId,
          },
        );
      }

      return {
        variantId: item.variantId,
        quantity: serialType ? serialNumbers.length : (item.quantity ?? 1),
        price,
        discount: item.discount ?? null,
        serialNumbers,
        warrantyMonths: variant.product.warrantyMonths,
      };
    });

    const duplicates = allSerials.filter((n, i) => allSerials.indexOf(n) !== i);
    if (duplicates.length) {
      throw new AppException(
        ErrorCode.DUPLICATE_IMEI,
        HttpStatus.CONFLICT,
        'Same IMEI twice in one sale',
        {
          numbers: [...new Set(duplicates)],
        },
      );
    }
    return prepared;
  }
}

function endOfDay(date: string): Date {
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function dateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
