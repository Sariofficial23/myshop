import { Body, Controller, Get, HttpStatus, Injectable, Module, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  CASH_OPERATION_TYPES,
  type CashOperationType,
  ErrorCode,
  PAYMENT_METHODS,
  type PaymentMethod,
  Permission,
} from '@myshop/shared';
import { Prisma } from '@myshop/database';
import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { assertBranchAccess, type AuthContext } from '../auth/auth-context.js';
import { AuditService } from '../audit/audit.service.js';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Db = Prisma.TransactionClient;

export class CashQuery {
  @ApiProperty()
  @IsUUID()
  branchId: string;

  @ApiPropertyOptional({ example: '2026-09-25', description: 'День (по часовому поясу компании)' })
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class CreateCashOperationDto {
  @ApiProperty()
  @IsUUID()
  branchId: string;

  @ApiProperty({ enum: CASH_OPERATION_TYPES })
  @IsIn(CASH_OPERATION_TYPES)
  type: CashOperationType;

  @ApiProperty({ example: '500000' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'number' ? String(value) : value))
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  amount: string;

  @ApiProperty({ example: 'Инкассация' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 500)
  reason: string;
}

type ByMethod = Record<PaymentMethod, string>;
const zeroByMethod = (): Record<PaymentMethod, Prisma.Decimal> =>
  Object.fromEntries(PAYMENT_METHODS.map((m) => [m, new Prisma.Decimal(0)])) as Record<
    PaymentMethod,
    Prisma.Decimal
  >;
const fixed = (values: Record<PaymentMethod, Prisma.Decimal>): ByMethod =>
  Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.toFixed(2)])) as ByMethod;

interface MethodSum {
  method: PaymentMethod;
  sum: Prisma.Decimal;
}

/**
 * Касса филиала. Наличные в кассе = продажи наличными + платежи по рассрочке наличными
 * − возвраты наличными + внесения − изъятия − расходы. Хранить остаток отдельно не нужно:
 * он всегда выводится из документов, поэтому не расходится с ними.
 */
@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async balance(db: Db, branchId: string): Promise<Prisma.Decimal> {
    const [row] = await db.$queryRaw<Array<{ balance: Prisma.Decimal }>>`
      SELECT
        (SELECT COALESCE(SUM(p.amount), 0) FROM payments p JOIN sales s ON s.id = p.sale_id
          WHERE s.branch_id = ${branchId}::uuid AND p.method = 'CASH')
      + (SELECT COALESCE(SUM(amount), 0) FROM installment_payments
          WHERE branch_id = ${branchId}::uuid AND method = 'CASH')
      - (SELECT COALESCE(SUM(r.amount), 0) FROM refunds r JOIN returns rt ON rt.id = r.return_id
          WHERE rt.branch_id = ${branchId}::uuid AND r.method = 'CASH')
      + (SELECT COALESCE(SUM(CASE WHEN type = 'DEPOSIT' THEN amount ELSE -amount END), 0)
          FROM cash_operations WHERE branch_id = ${branchId}::uuid) AS balance`;
    return new Prisma.Decimal(row?.balance ?? 0);
  }

  /** Итоги дня по филиалу: выручка по способам оплаты, возвраты, движение наличных. */
  async summary(ctx: AuthContext, query: CashQuery) {
    await this.assertBranch(ctx, query.branchId);
    const { tz, day } = await this.day(ctx, query.date);
    const branchId = query.branchId;
    const [sales, installments, refunds, operations, balance] = await Promise.all([
      this.prisma.$queryRaw<MethodSum[]>`
        SELECT p.method, SUM(p.amount) AS sum FROM payments p JOIN sales s ON s.id = p.sale_id
        WHERE s.branch_id = ${branchId}::uuid
          AND (p.created_at AT TIME ZONE ${tz})::date = ${day}::date
        GROUP BY p.method`,
      this.prisma.$queryRaw<MethodSum[]>`
        SELECT method, SUM(amount) AS sum FROM installment_payments
        WHERE branch_id = ${branchId}::uuid
          AND (created_at AT TIME ZONE ${tz})::date = ${day}::date
        GROUP BY method`,
      this.prisma.$queryRaw<MethodSum[]>`
        SELECT r.method, SUM(r.amount) AS sum FROM refunds r JOIN returns rt ON rt.id = r.return_id
        WHERE rt.branch_id = ${branchId}::uuid
          AND (r.created_at AT TIME ZONE ${tz})::date = ${day}::date
        GROUP BY r.method`,
      this.prisma.$queryRaw<Array<{ type: CashOperationType; sum: Prisma.Decimal }>>`
        SELECT type, SUM(amount) AS sum FROM cash_operations
        WHERE branch_id = ${branchId}::uuid
          AND (created_at AT TIME ZONE ${tz})::date = ${day}::date
        GROUP BY type`,
      this.balance(this.prisma, branchId),
    ]);
    const byMethod = (rows: MethodSum[]) => {
      const result = zeroByMethod();
      for (const row of rows) result[row.method] = new Prisma.Decimal(row.sum);
      return result;
    };
    const ops = Object.fromEntries(
      CASH_OPERATION_TYPES.map((type) => [
        type,
        new Prisma.Decimal(operations.find((o) => o.type === type)?.sum ?? 0),
      ]),
    ) as Record<CashOperationType, Prisma.Decimal>;
    const s = byMethod(sales);
    const i = byMethod(installments);
    const r = byMethod(refunds);
    const cashIn = s.CASH.add(i.CASH).add(ops.DEPOSIT);
    const cashOut = r.CASH.add(ops.WITHDRAWAL).add(ops.EXPENSE);
    return {
      branchId,
      date: day,
      balance: balance.toFixed(2),
      sales: fixed(s),
      installmentPayments: fixed(i),
      refunds: fixed(r),
      deposits: ops.DEPOSIT.toFixed(2),
      withdrawals: ops.WITHDRAWAL.toFixed(2),
      expenses: ops.EXPENSE.toFixed(2),
      cashIn: cashIn.toFixed(2),
      cashOut: cashOut.toFixed(2),
      /** Выручка дня всеми способами за вычетом возвратов. */
      revenue: PAYMENT_METHODS.reduce(
        (sum, m) => sum.add(s[m]).add(i[m]).sub(r[m]),
        new Prisma.Decimal(0),
      ).toFixed(2),
    };
  }

  async operations(ctx: AuthContext, query: CashQuery) {
    await this.assertBranch(ctx, query.branchId);
    const { tz, day } = await this.day(ctx, query.date);
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM cash_operations
      WHERE branch_id = ${query.branchId}::uuid
        AND (created_at AT TIME ZONE ${tz})::date = ${day}::date`;
    const rows = await this.prisma.cashOperation.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({ ...row, amount: row.amount.toFixed(2) }));
  }

  /**
   * Внесение / изъятие / расход. Касса филиала блокируется (advisory lock),
   * поэтому два изъятия одновременно не уведут остаток наличных в минус.
   */
  async createOperation(ctx: AuthContext, dto: CreateCashOperationDto) {
    await this.assertBranch(ctx, dto.branchId);
    const amount = new Prisma.Decimal(dto.amount);
    if (!amount.greaterThan(0)) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Amount > 0');
    }
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cash:${dto.branchId}`}))`;
      if (dto.type !== 'DEPOSIT') {
        const balance = await this.balance(tx, dto.branchId);
        if (amount.greaterThan(balance)) {
          throw new AppException(
            ErrorCode.CASH_INSUFFICIENT,
            HttpStatus.CONFLICT,
            'Not enough cash in the register',
            { balance: balance.toFixed(2) },
          );
        }
      }
      const operation = await tx.cashOperation.create({
        data: {
          companyId: ctx.companyId,
          branchId: dto.branchId,
          type: dto.type,
          amount,
          reason: dto.reason,
          createdById: ctx.userId,
        },
      });
      await this.audit.log(tx, ctx, {
        action: 'PAYMENT',
        entity: 'CashOperation',
        entityId: operation.id,
        newValue: { type: dto.type, amount: amount.toFixed(2), reason: dto.reason },
      });
      return operation;
    });
    return { ...created, amount: created.amount.toFixed(2) };
  }

  private async assertBranch(ctx: AuthContext, branchId: string) {
    assertBranchAccess(ctx, branchId);
    const branch = await this.prisma.branch.count({
      where: { id: branchId, companyId: ctx.companyId },
    });
    if (!branch) {
      throw new AppException(ErrorCode.BRANCH_NOT_FOUND, HttpStatus.NOT_FOUND, 'Branch not found');
    }
  }

  /** День считается по часовому поясу компании (по умолчанию Asia/Tashkent). */
  private async day(ctx: AuthContext, date?: string) {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: ctx.companyId },
      select: { timezone: true },
    });
    const tz = company.timezone;
    const day = date ?? new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    return { tz, day };
  }
}

@ApiTags('cash')
@ApiBearerAuth()
@Controller('cash')
export class CashController {
  constructor(private readonly cash: CashService) {}

  @Get('summary')
  @RequirePermissions(Permission.CASH_MANAGE)
  @ApiOperation({ summary: 'Касса филиала: остаток наличных и итоги дня' })
  summary(@CurrentAuth() ctx: AuthContext, @Query() query: CashQuery) {
    return this.cash.summary(ctx, query);
  }

  @Get('operations')
  @RequirePermissions(Permission.CASH_MANAGE)
  @ApiOperation({ summary: 'Внесения, изъятия и расходы за день' })
  operations(@CurrentAuth() ctx: AuthContext, @Query() query: CashQuery) {
    return this.cash.operations(ctx, query);
  }

  @Post('operations')
  @RequirePermissions(Permission.CASH_MANAGE)
  @ApiOperation({ summary: 'Внести, изъять или записать расход из кассы' })
  create(@CurrentAuth() ctx: AuthContext, @Body() dto: CreateCashOperationDto) {
    return this.cash.createOperation(ctx, dto);
  }
}

@Module({ controllers: [CashController], providers: [CashService] })
export class CashModule {}
