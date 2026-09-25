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
  InstallmentStatus,
  PAYMENT_METHODS,
  type PaymentMethod,
  Permission,
} from '@myshop/shared';
import { Prisma } from '@myshop/database';
import { Transform, Type } from 'class-transformer';
import { IsBooleanString, IsIn, IsInt, IsOptional, IsUUID, Matches, Min } from 'class-validator';
import {
  accessibleBranchWhere,
  assertBranchAccess,
  type AuthContext,
} from '../auth/auth-context.js';
import { AuditService } from '../audit/audit.service.js';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { installmentState } from './installment-calc.js';

export class InstallmentPaymentDto {
  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  method: PaymentMethod;

  @ApiProperty({ example: '1000000' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'number' ? String(value) : value))
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  amount: string;

  @ApiProperty({ description: 'Филиал, где приняты деньги (касса)' })
  @IsUUID()
  branchId: string;
}

export class ListInstallmentsQuery {
  @ApiPropertyOptional({ enum: Object.values(InstallmentStatus) })
  @IsOptional()
  @IsIn(Object.values(InstallmentStatus))
  status?: InstallmentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Только с просрочкой' })
  @IsOptional()
  @IsBooleanString()
  overdue?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

const installmentInclude = {
  branch: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true, phone: true } },
  sale: { select: { id: true, number: true, date: true, total: true } },
  payments: {
    orderBy: { createdAt: 'asc' },
    include: { receivedBy: { select: { id: true, firstName: true, lastName: true } } },
  },
} satisfies Prisma.InstallmentInclude;
type InstallmentWithRelations = Prisma.InstallmentGetPayload<{
  include: typeof installmentInclude;
}>;

function toResponse(item: InstallmentWithRelations, today = new Date()) {
  const state = installmentState(item, today);
  return {
    ...item,
    total: item.total.toFixed(2),
    paidAmount: item.paidAmount.toFixed(2),
    reducedAmount: item.reducedAmount.toFixed(2),
    monthlyAmount: item.monthlyAmount.toFixed(2),
    remaining: state.remaining.toFixed(2),
    overdueAmount: item.status === 'PAID' ? '0.00' : state.overdueAmount.toFixed(2),
    nextDueDate: item.status === 'PAID' ? null : state.nextDueDate,
    nextDueAmount: item.status === 'PAID' ? null : (state.nextDueAmount?.toFixed(2) ?? null),
    schedule: state.schedule.map((row) => ({
      dueDate: row.dueDate,
      amount: row.amount.toFixed(2),
      covered: row.covered.toFixed(2),
    })),
    sale: {
      ...item.sale,
      total: item.sale.total.toFixed(2),
      displayNumber: formatDocumentNumber(DocumentPrefix.SALE, item.sale.number),
    },
    payments: item.payments.map((p) => ({ ...p, amount: p.amount.toFixed(2) })),
  };
}

const notFound = () =>
  new AppException(ErrorCode.INSTALLMENT_NOT_FOUND, HttpStatus.NOT_FOUND, 'Installment not found');

@Injectable()
export class InstallmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Рассрочки видны по филиалам продажи, к которым есть доступ. Просрочка считается на сегодня. */
  async list(ctx: AuthContext, query: ListInstallmentsQuery) {
    const where: Prisma.InstallmentWhereInput = {
      companyId: ctx.companyId,
      branch: accessibleBranchWhere(ctx),
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
    };
    const rows = await this.prisma.installment.findMany({
      where,
      include: installmentInclude,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 500,
    });
    let items = rows.map((row) => toResponse(row));
    if (query.overdue === 'true') items = items.filter((i) => Number(i.overdueAmount) > 0);
    const page = query.page ?? 1;
    const pageSize = 30;
    return {
      items: items.slice((page - 1) * pageSize, page * pageSize),
      total: items.length,
      page,
      pageSize,
      totals: {
        remaining: items.reduce((sum, i) => sum.add(i.remaining), new Prisma.Decimal(0)).toFixed(2),
        overdue: items
          .reduce((sum, i) => sum.add(i.overdueAmount), new Prisma.Decimal(0))
          .toFixed(2),
      },
    };
  }

  async get(ctx: AuthContext, id: string) {
    const found = await this.prisma.installment.findFirst({
      where: { id, companyId: ctx.companyId },
      include: installmentInclude,
    });
    if (!found) throw notFound();
    assertBranchAccess(ctx, found.branchId);
    return toResponse(found);
  }

  /**
   * Платёж по рассрочке. Строка рассрочки блокируется: два одновременных платежа
   * не переплатят долг. Когда долг погашен — статус PAID.
   */
  async pay(ctx: AuthContext, id: string, dto: InstallmentPaymentDto) {
    await this.get(ctx, id);
    assertBranchAccess(ctx, dto.branchId);
    const amount = new Prisma.Decimal(dto.amount);
    if (!amount.greaterThan(0)) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Amount > 0');
    }
    const branch = await this.prisma.branch.count({
      where: { id: dto.branchId, companyId: ctx.companyId, isActive: true },
    });
    if (!branch) {
      throw new AppException(ErrorCode.BRANCH_NOT_FOUND, HttpStatus.NOT_FOUND, 'Branch not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM installments WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.installment.findUniqueOrThrow({ where: { id } });
      if (current.status === 'PAID') {
        throw new AppException(
          ErrorCode.INSTALLMENT_CLOSED,
          HttpStatus.CONFLICT,
          'Installment is already paid',
        );
      }
      const remaining = current.total.sub(current.paidAmount).sub(current.reducedAmount);
      if (amount.greaterThan(remaining)) {
        throw new AppException(
          ErrorCode.INSTALLMENT_OVERPAYMENT,
          HttpStatus.BAD_REQUEST,
          'Payment exceeds the remaining debt',
          { remaining: remaining.toFixed(2) },
        );
      }
      await tx.installmentPayment.create({
        data: {
          companyId: ctx.companyId,
          installmentId: id,
          branchId: dto.branchId,
          method: dto.method,
          amount,
          receivedById: ctx.userId,
        },
      });
      const paidOff = amount.equals(remaining);
      await tx.installment.update({
        where: { id },
        data: {
          paidAmount: { increment: amount },
          ...(paidOff ? { status: 'PAID' } : {}),
        },
      });
      await this.audit.log(tx, ctx, {
        action: 'PAYMENT',
        entity: 'Installment',
        entityId: id,
        newValue: {
          method: dto.method,
          amount: amount.toFixed(2),
          remaining: remaining.sub(amount).toFixed(2),
        },
      });
    });
    return this.get(ctx, id);
  }
}

@ApiTags('installments')
@ApiBearerAuth()
@Controller('installments')
export class InstallmentsController {
  constructor(private readonly installments: InstallmentsService) {}

  @Get()
  @RequirePermissions(Permission.SALES_VIEW)
  @ApiOperation({ summary: 'Рассрочки: долг, просрочка, ближайший платёж' })
  list(@CurrentAuth() ctx: AuthContext, @Query() query: ListInstallmentsQuery) {
    return this.installments.list(ctx, query);
  }

  @Get(':id')
  @RequirePermissions(Permission.SALES_VIEW)
  @ApiOperation({ summary: 'Рассрочка с графиком платежей' })
  get(@CurrentAuth() ctx: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.installments.get(ctx, id);
  }

  @Post(':id/payments')
  @RequirePermissions(Permission.SALES_CREATE)
  @ApiOperation({ summary: 'Принять платёж по рассрочке' })
  pay(
    @CurrentAuth() ctx: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: InstallmentPaymentDto,
  ) {
    return this.installments.pay(ctx, id, dto);
  }
}

@Module({ controllers: [InstallmentsController], providers: [InstallmentsService] })
export class InstallmentsModule {}
