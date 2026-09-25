import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { PAYMENT_METHODS, type PaymentMethod, Permission } from '@myshop/shared';
import { Prisma } from '@myshop/database';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { assertBranchAccess, type AuthContext, hasPermission } from '../auth/auth-context.js';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';

export class SalesReportQuery {
  @ApiPropertyOptional({ description: 'Филиал (по умолчанию — все доступные)' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ example: '2026-09-25', description: 'С даты (по умолчанию сегодня)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-25', description: 'По дату включительно' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

const D = (value: Prisma.Decimal | string | number | null | undefined) =>
  new Prisma.Decimal(value ?? 0);

/**
 * Отчёт о продажах за период: сколько продано, на какую сумму, чем оплатили, какие товары.
 * Дни считаются по часовому поясу компании. Данные — только по доступным филиалам.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async sales(ctx: AuthContext, query: SalesReportQuery) {
    if (query.branchId) assertBranchAccess(ctx, query.branchId);
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: ctx.companyId },
      select: { timezone: true },
    });
    const tz = company.timezone;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    const from = query.from ?? today;
    const to = query.to ?? from;
    const branchIds = query.branchId
      ? [query.branchId]
      : ctx.allBranches
        ? null
        : [...ctx.branchIds];
    const companyId = ctx.companyId;
    // Общий фильтр: компания, филиалы, период по локальной дате
    const inPeriod = (column: Prisma.Sql, branchColumn: Prisma.Sql) => Prisma.sql`
      ${branchColumn} IN (SELECT id FROM branches WHERE company_id = ${companyId}::uuid)
      AND (${branchIds}::uuid[] IS NULL OR ${branchColumn} = ANY(${branchIds}::uuid[]))
      AND (${column} AT TIME ZONE ${tz})::date BETWEEN ${from}::date AND ${to}::date`;

    const [totals, returns, payments, installmentPayments, refunds, items, sellers] =
      await Promise.all([
        this.prisma.$queryRaw<
          Array<{ count: bigint; revenue: string; discount: string; cost: string }>
        >`
          SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS revenue,
                 COALESCE(SUM(discount_total), 0) AS discount, COALESCE(SUM(cost_total), 0) AS cost
          FROM sales s WHERE ${inPeriod(Prisma.sql`s.date`, Prisma.sql`s.branch_id`)}`,
        this.prisma.$queryRaw<Array<{ count: bigint; amount: string; cost: string }>>`
          SELECT COUNT(*) AS count, COALESCE(SUM(refund_total), 0) AS amount,
                 COALESCE(SUM(cost_total), 0) AS cost
          FROM returns r WHERE ${inPeriod(Prisma.sql`r.date`, Prisma.sql`r.branch_id`)}`,
        this.prisma.$queryRaw<Array<{ method: PaymentMethod; sum: string }>>`
          SELECT p.method, SUM(p.amount) AS sum FROM payments p JOIN sales s ON s.id = p.sale_id
          WHERE ${inPeriod(Prisma.sql`p.created_at`, Prisma.sql`s.branch_id`)}
          GROUP BY p.method`,
        this.prisma.$queryRaw<Array<{ method: PaymentMethod; sum: string }>>`
          SELECT ip.method, SUM(ip.amount) AS sum FROM installment_payments ip
          WHERE ${inPeriod(Prisma.sql`ip.created_at`, Prisma.sql`ip.branch_id`)}
          GROUP BY ip.method`,
        this.prisma.$queryRaw<Array<{ method: PaymentMethod; sum: string }>>`
          SELECT rf.method, SUM(rf.amount) AS sum FROM refunds rf JOIN returns r ON r.id = rf.return_id
          WHERE ${inPeriod(Prisma.sql`rf.created_at`, Prisma.sql`r.branch_id`)}
          GROUP BY rf.method`,
        this.prisma.$queryRaw<
          Array<{
            variant_id: string;
            product: string;
            variant: string | null;
            sku: string;
            quantity: bigint;
            amount: string;
            cost: string;
          }>
        >`
          SELECT si.variant_id, pr.name AS product, v.name AS variant, v.sku,
                 SUM(si.quantity) AS quantity, SUM(si.total) AS amount,
                 SUM(si.unit_cost * si.quantity) AS cost
          FROM sale_items si
          JOIN sales s ON s.id = si.sale_id
          JOIN product_variants v ON v.id = si.variant_id
          JOIN products pr ON pr.id = v.product_id
          WHERE ${inPeriod(Prisma.sql`s.date`, Prisma.sql`s.branch_id`)}
          GROUP BY si.variant_id, pr.name, v.name, v.sku
          ORDER BY SUM(si.total) DESC
          LIMIT 100`,
        this.prisma.$queryRaw<
          Array<{
            id: string;
            first_name: string;
            last_name: string | null;
            count: bigint;
            revenue: string;
          }>
        >`
          SELECT u.id, u.first_name, u.last_name, COUNT(*) AS count, SUM(s.total) AS revenue
          FROM sales s JOIN users u ON u.id = s.seller_id
          WHERE ${inPeriod(Prisma.sql`s.date`, Prisma.sql`s.branch_id`)}
          GROUP BY u.id, u.first_name, u.last_name
          ORDER BY SUM(s.total) DESC`,
      ]);

    const showProfit = hasPermission(ctx, Permission.REPORTS_VIEW);
    const t = totals[0]!;
    const r = returns[0]!;
    const count = Number(t.count);
    const revenue = D(t.revenue);
    const netRevenue = revenue.sub(r.amount);
    const byMethod = (rows: Array<{ method: PaymentMethod; sum: string }>) =>
      Object.fromEntries(
        PAYMENT_METHODS.map((m) => [m, D(rows.find((row) => row.method === m)?.sum).toFixed(2)]),
      ) as Record<PaymentMethod, string>;
    const received = byMethod(payments);
    const fromInstallments = byMethod(installmentPayments);
    const refunded = byMethod(refunds);

    return {
      from,
      to,
      salesCount: count,
      itemsSold: items.reduce((sum, i) => sum + Number(i.quantity), 0),
      revenue: revenue.toFixed(2),
      discount: D(t.discount).toFixed(2),
      returnsCount: Number(r.count),
      returns: D(r.amount).toFixed(2),
      netRevenue: netRevenue.toFixed(2),
      averageCheck: count ? revenue.div(count).toDecimalPlaces(2).toFixed(2) : '0.00',
      // Прибыль = выручка − себестоимость, за вычетом возвратов (их выручки и себестоимости)
      grossProfit: showProfit ? netRevenue.sub(D(t.cost).sub(r.cost)).toFixed(2) : undefined,
      /** Деньги, полученные за период, по способам оплаты (продажи + рассрочки − возвраты). */
      money: Object.fromEntries(
        PAYMENT_METHODS.map((m) => [
          m,
          D(received[m]).add(fromInstallments[m]).sub(refunded[m]).toFixed(2),
        ]),
      ) as Record<PaymentMethod, string>,
      items: items.map((i) => ({
        variantId: i.variant_id,
        product: i.product,
        variant: i.variant,
        sku: i.sku,
        quantity: Number(i.quantity),
        amount: D(i.amount).toFixed(2),
        profit: showProfit ? D(i.amount).sub(i.cost).toFixed(2) : undefined,
      })),
      sellers: sellers.map((s) => ({
        id: s.id,
        name: [s.first_name, s.last_name].filter(Boolean).join(' '),
        salesCount: Number(s.count),
        revenue: D(s.revenue).toFixed(2),
      })),
    };
  }
}

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales')
  @RequirePermissions(Permission.SALES_VIEW)
  @ApiOperation({ summary: 'Продажи за период: сумма, количество, оплаты, проданные товары' })
  sales(@CurrentAuth() ctx: AuthContext, @Query() query: SalesReportQuery) {
    return this.reports.sales(ctx, query);
  }
}

@Module({ controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
