import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@myshop/shared';
import { Prisma, type StockMovementType } from '@myshop/database';
import {
  accessibleBranchWhere,
  assertBranchAccess,
  type AuthContext,
} from '../auth/auth-context.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { nextBalance, weightedAverageCost } from './stock-calc.js';

export interface MovementInput {
  branchId: string;
  variantId: string;
  type: StockMovementType;
  /** Со знаком: + поступление, − расход. */
  quantity: number;
  /** Себестоимость единицы (для поступлений влияет на средневзвешенную себестоимость). */
  unitCost?: Prisma.Decimal | string;
  purchaseId?: string;
}

interface LockedBalance {
  quantity: number;
  avg_cost: Prisma.Decimal;
}

/**
 * ЕДИНСТВЕННОЕ место, где меняется остаток. Вызывается только из документов
 * (приход, продажа, возврат, перемещение, списание, инвентаризация) внутри их транзакции.
 */
@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async applyMovement(tx: Prisma.TransactionClient, ctx: AuthContext, input: MovementInput) {
    if (!Number.isInteger(input.quantity) || input.quantity === 0) {
      throw new Error('Movement quantity must be a non-zero integer');
    }

    // Строка остатка создаётся при необходимости и блокируется до конца транзакции
    await tx.$executeRaw`
      INSERT INTO stock_balances (company_id, branch_id, variant_id, quantity, avg_cost, updated_at)
      VALUES (${ctx.companyId}::uuid, ${input.branchId}::uuid, ${input.variantId}::uuid, 0, 0, now())
      ON CONFLICT (branch_id, variant_id) DO NOTHING`;
    const [locked] = await tx.$queryRaw<LockedBalance[]>`
      SELECT quantity, avg_cost FROM stock_balances
      WHERE branch_id = ${input.branchId}::uuid AND variant_id = ${input.variantId}::uuid
      FOR UPDATE`;
    if (!locked) throw new Error('Stock balance row was not created');

    const balanceAfter = nextBalance(locked.quantity, input.quantity);
    if (balanceAfter === null) {
      throw new AppException(
        ErrorCode.INSUFFICIENT_STOCK,
        HttpStatus.CONFLICT,
        'Insufficient stock',
        {
          variantId: input.variantId,
          available: locked.quantity,
          requested: -input.quantity,
        },
      );
    }

    const avgCost =
      input.quantity > 0 && input.unitCost !== undefined
        ? weightedAverageCost(locked.quantity, locked.avg_cost, input.quantity, input.unitCost)
        : new Prisma.Decimal(locked.avg_cost);

    await tx.stockBalance.update({
      where: { branchId_variantId: { branchId: input.branchId, variantId: input.variantId } },
      data: { quantity: balanceAfter, avgCost },
    });

    return tx.stockMovement.create({
      data: {
        companyId: ctx.companyId,
        branchId: input.branchId,
        variantId: input.variantId,
        type: input.type,
        quantity: input.quantity,
        balanceAfter,
        unitCost: input.unitCost ?? (input.quantity < 0 ? locked.avg_cost : undefined),
        purchaseId: input.purchaseId,
        createdById: ctx.userId,
      },
    });
  }

  /** Остатки в доступных филиалах. lowOnly — только "заканчивается" (≤ минимального остатка). */
  async balances(ctx: AuthContext, query: { branchId?: string; q?: string; lowOnly?: boolean }) {
    if (query.branchId) assertBranchAccess(ctx, query.branchId);
    const branchWhere = accessibleBranchWhere(ctx);
    const rows = await this.prisma.stockBalance.findMany({
      where: {
        companyId: ctx.companyId,
        branch: branchWhere,
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.q
          ? {
              variant: {
                OR: [
                  { sku: { contains: query.q, mode: 'insensitive' } },
                  { name: { contains: query.q, mode: 'insensitive' } },
                  { product: { name: { contains: query.q, mode: 'insensitive' } } },
                ],
              },
            }
          : {}),
      },
      include: {
        branch: { select: { id: true, name: true } },
        variant: {
          select: {
            id: true,
            sku: true,
            name: true,
            salePrice: true,
            product: { select: { id: true, name: true, minimumStock: true, serialType: true } },
          },
        },
      },
      orderBy: [{ variant: { product: { name: 'asc' } } }, { branch: { name: 'asc' } }],
      take: 500,
    });
    return rows
      .map((row) => ({
        branch: row.branch,
        variant: {
          id: row.variant.id,
          sku: row.variant.sku,
          name: row.variant.name,
          salePrice: row.variant.salePrice?.toFixed(2) ?? null,
        },
        product: row.variant.product,
        quantity: row.quantity,
        avgCost: row.avgCost.toFixed(2),
        stockValue: row.avgCost.mul(row.quantity).toFixed(2),
        low: row.quantity <= row.variant.product.minimumStock,
      }))
      .filter((row) => !query.lowOnly || row.low);
  }

  /** История движений варианта (приход → перемещение → продажа → возврат). */
  async movements(
    ctx: AuthContext,
    query: { variantId?: string; branchId?: string; purchaseId?: string },
  ) {
    if (query.branchId) assertBranchAccess(ctx, query.branchId);
    const rows = await this.prisma.stockMovement.findMany({
      where: {
        companyId: ctx.companyId,
        branch: accessibleBranchWhere(ctx),
        ...(query.variantId ? { variantId: query.variantId } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.purchaseId ? { purchaseId: query.purchaseId } : {}),
      },
      include: {
        branch: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        purchase: { select: { id: true, number: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    return rows.map((row) => ({ ...row, unitCost: row.unitCost?.toFixed(2) ?? null }));
  }
}
