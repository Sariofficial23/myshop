import { HttpStatus, Injectable } from '@nestjs/common';
import { DocumentPrefix, ErrorCode, formatDocumentNumber } from '@myshop/shared';
import { Prisma } from '@myshop/database';
import {
  accessibleBranchWhere,
  assertBranchAccess,
  type AuthContext,
} from '../auth/auth-context.js';
import { AuditService } from '../audit/audit.service.js';
import { nextDocumentNumber } from '../common/documents/document-number.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { lineTotal, sumDecimals } from '../stock/stock-calc.js';
import { StockService } from '../stock/stock.service.js';
import { SuppliersService } from '../suppliers/suppliers.js';
import type {
  CreatePurchaseDto,
  ListPurchasesQuery,
  PurchaseItemDto,
  UpdatePurchaseDto,
} from './purchases.dto.js';
import { assertNoDuplicateSerials, validateItemSerials } from './purchase-validation.js';

type Tx = Prisma.TransactionClient;

const purchaseInclude = {
  branch: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  confirmedBy: { select: { id: true, firstName: true, lastName: true } },
  items: {
    orderBy: { createdAt: 'asc' },
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
} satisfies Prisma.PurchaseInclude;

type PurchaseWithRelations = Prisma.PurchaseGetPayload<{ include: typeof purchaseInclude }>;

function toResponse(purchase: PurchaseWithRelations) {
  return {
    ...purchase,
    displayNumber: formatDocumentNumber(DocumentPrefix.PURCHASE, purchase.number),
    total: purchase.total.toFixed(2),
    items: purchase.items.map((item) => ({
      ...item,
      purchasePrice: item.purchasePrice.toFixed(2),
      salePrice: item.salePrice?.toFixed(2) ?? null,
      total: item.total.toFixed(2),
    })),
  };
}

/** Большие приходы с сотнями IMEI не должны упираться в стандартный таймаут транзакции (5 с). */
const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };

const notFound = () =>
  new AppException(ErrorCode.PURCHASE_NOT_FOUND, HttpStatus.NOT_FOUND, 'Purchase not found');

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly suppliers: SuppliersService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: AuthContext, query: ListPurchasesQuery) {
    if (query.branchId) assertBranchAccess(ctx, query.branchId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const where: Prisma.PurchaseWhereInput = {
      companyId: ctx.companyId,
      branch: accessibleBranchWhere(ctx),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.status ? { status: query.status } : {}),
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
      this.prisma.purchase.findMany({
        where,
        include: purchaseInclude,
        orderBy: [{ date: 'desc' }, { number: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.purchase.count({ where }),
    ]);
    return { items: items.map(toResponse), total, page, pageSize };
  }

  async get(ctx: AuthContext, id: string) {
    return toResponse(await this.find(this.prisma, ctx, id));
  }

  async create(ctx: AuthContext, dto: CreatePurchaseDto) {
    await this.assertHeader(ctx, dto.branchId, dto.supplierId);
    const lines = await this.prepareItems(ctx, dto.items);

    const id = await this.prisma.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, ctx.companyId, 'PURCHASE');
      const purchase = await tx.purchase.create({
        data: {
          companyId: ctx.companyId,
          branchId: dto.branchId,
          supplierId: dto.supplierId ?? null,
          number,
          documentNumber: dto.documentNumber ?? null,
          date: dto.date ? new Date(dto.date) : new Date(),
          notes: dto.notes ?? null,
          total: sumDecimals(lines.map((line) => line.total)),
          createdById: ctx.userId,
          items: { create: lines },
        },
      });
      await this.audit.log(tx, ctx, {
        action: 'CREATE',
        entity: 'Purchase',
        entityId: purchase.id,
        newValue: { number, branchId: dto.branchId, items: lines.length },
      });
      if (dto.confirm) await this.confirmInTx(tx, ctx, purchase.id);
      return purchase.id;
    }, TX_OPTIONS);
    return this.get(ctx, id);
  }

  async update(ctx: AuthContext, id: string, dto: UpdatePurchaseDto) {
    const current = await this.find(this.prisma, ctx, id);
    assertDraft(current.status);
    const branchId = dto.branchId ?? current.branchId;
    await this.assertHeader(ctx, branchId, dto.supplierId);
    const lines = dto.items ? await this.prepareItems(ctx, dto.items) : undefined;

    await this.prisma.$transaction(async (tx) => {
      // Защита от гонки: документ меняем, только если он всё ещё черновик
      const { count } = await tx.purchase.updateMany({
        where: { id, companyId: ctx.companyId, status: 'DRAFT' },
        data: {
          branchId,
          ...(dto.supplierId !== undefined ? { supplierId: dto.supplierId } : {}),
          ...(dto.documentNumber !== undefined ? { documentNumber: dto.documentNumber } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.date ? { date: new Date(dto.date) } : {}),
          ...(lines ? { total: sumDecimals(lines.map((line) => line.total)) } : {}),
        },
      });
      if (count === 0) assertDraft('CONFIRMED');
      if (lines) {
        await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });
        await tx.purchaseItem.createMany({
          data: lines.map((line) => ({ ...line, purchaseId: id })),
        });
      }
      await this.audit.log(tx, ctx, { action: 'UPDATE', entity: 'Purchase', entityId: id });
    }, TX_OPTIONS);
    return this.get(ctx, id);
  }

  async confirm(ctx: AuthContext, id: string) {
    await this.find(this.prisma, ctx, id);
    await this.prisma.$transaction((tx) => this.confirmInTx(tx, ctx, id), TX_OPTIONS);
    return this.get(ctx, id);
  }

  async cancel(ctx: AuthContext, id: string) {
    await this.find(this.prisma, ctx, id);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.purchase.updateMany({
        where: { id, companyId: ctx.companyId, status: 'DRAFT' },
        data: { status: 'CANCELLED' },
      });
      if (count === 0) assertDraft('CONFIRMED');
      await this.audit.log(tx, ctx, {
        action: 'UPDATE',
        entity: 'Purchase',
        entityId: id,
        newValue: { status: 'CANCELLED' },
      });
    });
    return this.get(ctx, id);
  }

  /**
   * Проведение прихода — всё или ничего:
   *  1. статус DRAFT → CONFIRMED (условно — повторное проведение невозможно);
   *  2. проверка IMEI / серийных номеров (формат, количество, дубли в документе и в базе);
   *  3. StockMovement PURCHASE + остаток + средневзвешенная себестоимость;
   *  4. SerialNumber со статусом IN_STOCK;
   *  5. новая цена продажи варианта;
   *  6. запись в журнал аудита.
   */
  private async confirmInTx(tx: Tx, ctx: AuthContext, id: string) {
    const { count } = await tx.purchase.updateMany({
      where: { id, companyId: ctx.companyId, status: 'DRAFT' },
      data: { status: 'CONFIRMED', confirmedById: ctx.userId, confirmedAt: new Date() },
    });
    if (count === 0) assertDraft('CONFIRMED');

    const purchase = await tx.purchase.findUniqueOrThrow({
      where: { id },
      include: { items: { include: { variant: { include: { product: true } } } } },
    });
    assertBranchAccess(ctx, purchase.branchId);

    const serialsByItem = purchase.items.map((item) =>
      validateItemSerials({
        variantId: item.variantId,
        quantity: item.quantity,
        serialNumbers: item.serialNumbers,
        serialType: item.variant.product.serialType,
        productName: item.variant.product.name,
      }),
    );
    const allSerials = serialsByItem.flat();
    assertNoDuplicateSerials(allSerials);
    if (allSerials.length) {
      const existing = await tx.serialNumber.findMany({
        where: { companyId: ctx.companyId, number: { in: allSerials } },
        select: { number: true },
      });
      if (existing.length) {
        throw new AppException(
          ErrorCode.DUPLICATE_IMEI,
          HttpStatus.CONFLICT,
          'Serial numbers already exist',
          {
            numbers: existing.map((s) => s.number),
          },
        );
      }
    }

    for (const [index, item] of purchase.items.entries()) {
      await this.stock.applyMovement(tx, ctx, {
        branchId: purchase.branchId,
        variantId: item.variantId,
        type: 'PURCHASE',
        quantity: item.quantity,
        unitCost: item.purchasePrice,
        purchaseId: purchase.id,
      });
      const serials = serialsByItem[index]!;
      if (serials.length) {
        await tx.serialNumber.createMany({
          data: serials.map((number) => ({
            companyId: ctx.companyId,
            variantId: item.variantId,
            branchId: purchase.branchId,
            purchaseId: purchase.id,
            type: item.variant.product.serialType!,
            number,
          })),
        });
      }
      if (item.salePrice) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { salePrice: item.salePrice },
        });
      }
    }

    await this.audit.log(tx, ctx, {
      action: 'PURCHASE',
      entity: 'Purchase',
      entityId: purchase.id,
      newValue: {
        number: purchase.number,
        branchId: purchase.branchId,
        total: purchase.total.toFixed(2),
        items: purchase.items.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
          purchasePrice: item.purchasePrice.toFixed(2),
          serials: item.serialNumbers.length,
        })),
      },
    });
  }

  private async find(tx: Tx, ctx: AuthContext, id: string): Promise<PurchaseWithRelations> {
    const purchase = await tx.purchase.findFirst({
      where: { id, companyId: ctx.companyId },
      include: purchaseInclude,
    });
    if (!purchase) throw notFound();
    assertBranchAccess(ctx, purchase.branchId);
    return purchase;
  }

  private async assertHeader(ctx: AuthContext, branchId: string, supplierId?: string | null) {
    assertBranchAccess(ctx, branchId);
    const branch = await this.prisma.branch.count({
      where: { id: branchId, companyId: ctx.companyId, isActive: true },
    });
    if (!branch) {
      throw new AppException(ErrorCode.BRANCH_NOT_FOUND, HttpStatus.NOT_FOUND, 'Branch not found');
    }
    if (supplierId) await this.suppliers.assertInCompany(ctx, supplierId);
  }

  /** Строки документа: варианты своей компании, суммы, нормализованные номера. */
  private async prepareItems(ctx: AuthContext, items: PurchaseItemDto[]) {
    const variantIds = [...new Set(items.map((item) => item.variantId))];
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds }, companyId: ctx.companyId },
      include: { product: { select: { name: true, isActive: true, serialType: true } } },
    });
    const byId = new Map(variants.map((variant) => [variant.id, variant]));
    return items.map((item) => {
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
      const serialNumbers = (item.serialNumbers ?? []).map((value) => value.trim()).filter(Boolean);
      return {
        variantId: item.variantId,
        quantity: item.quantity,
        purchasePrice: new Prisma.Decimal(item.purchasePrice),
        salePrice: item.salePrice ? new Prisma.Decimal(item.salePrice) : null,
        total: lineTotal(item.quantity, item.purchasePrice),
        serialNumbers,
      };
    });
  }
}

function assertDraft(status: string): void {
  if (status !== 'DRAFT') {
    throw new AppException(
      ErrorCode.DOCUMENT_NOT_DRAFT,
      HttpStatus.CONFLICT,
      'Only draft documents can be changed or confirmed',
    );
  }
}

function endOfDay(date: string): Date {
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}
