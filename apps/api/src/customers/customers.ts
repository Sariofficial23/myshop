import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { DocumentPrefix, ErrorCode, formatDocumentNumber, Permission } from '@myshop/shared';
import { Prisma } from '@myshop/database';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { accessibleBranchWhere, type AuthContext } from '../auth/auth-context.js';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { AppException } from '../common/errors/app.exception.js';
import { installmentState } from '../installments/installment-calc.js';
import { PrismaService } from '../prisma/prisma.service.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;
/** Телефон храним в одном формате: только "+" и цифры — так поиск и уникальность надёжны. */
const normalizePhone = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[^\d+]/g, '') || null : value;

export class CreateCustomerDto {
  @ApiProperty({ example: 'Алишер Каримов' })
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  name: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsOptional()
  @Transform(normalizePhone)
  @Matches(/^\+?\d{5,15}$/)
  phone?: string | null;

  @ApiPropertyOptional({ example: '123456789' })
  @IsOptional()
  @Transform(emptyToNull)
  @Matches(/^\d{1,20}$/)
  telegramId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class UpdateCustomerDto extends CreateCustomerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  declare name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CustomersQuery {
  @ApiPropertyOptional({ description: 'Имя или телефон' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
}

const customerSelect = {
  id: true,
  name: true,
  phone: true,
  telegramId: true,
  notes: true,
  isActive: true,
  createdAt: true,
} as const;

type CustomerRow = Prisma.CustomerGetPayload<{ select: typeof customerSelect }>;
const sumFixed = (values: Prisma.Decimal[]) =>
  values.reduce((acc, v) => acc.add(v), new Prisma.Decimal(0)).toFixed(2);
const toResponse = (c: CustomerRow) => ({ ...c, telegramId: c.telegramId?.toString() ?? null });

/** Клиенты: поиск, карточка с историей покупок, долгом по рассрочкам. */
@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: AuthContext, q?: string) {
    const digits = q?.replace(/\D/g, '');
    const rows = await this.prisma.customer.findMany({
      where: {
        companyId: ctx.companyId,
        isActive: true,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                ...(digits && digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
              ],
            }
          : {}),
      },
      select: customerSelect,
      orderBy: { name: 'asc' },
      take: 50,
    });
    const debts = await this.debts(
      ctx,
      rows.map((r) => r.id),
    );
    return rows.map((row) => ({ ...toResponse(row), debt: debts.get(row.id) ?? '0.00' }));
  }

  /**
   * Карточка клиента: покупки в доступных филиалах, сумма покупок за вычетом возвратов,
   * долг и просрочка по рассрочкам.
   */
  async card(ctx: AuthContext, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, companyId: ctx.companyId },
      select: customerSelect,
    });
    if (!customer) {
      throw new AppException(
        ErrorCode.CUSTOMER_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Customer not found',
      );
    }
    const branch = accessibleBranchWhere(ctx);
    const [sales, totals, refunds, installments] = await Promise.all([
      this.prisma.sale.findMany({
        where: { companyId: ctx.companyId, customerId: id, branch },
        select: {
          id: true,
          number: true,
          date: true,
          total: true,
          status: true,
          paymentType: true,
          branch: { select: { id: true, name: true } },
        },
        orderBy: { date: 'desc' },
        take: 20,
      }),
      this.prisma.sale.aggregate({
        where: { companyId: ctx.companyId, customerId: id, branch },
        _sum: { total: true },
        _count: true,
        _max: { date: true },
      }),
      this.prisma.saleReturn.aggregate({
        where: { companyId: ctx.companyId, sale: { customerId: id }, branch },
        _sum: { refundTotal: true },
      }),
      this.prisma.installment.findMany({
        where: { companyId: ctx.companyId, customerId: id, branch, status: 'ACTIVE' },
        include: { sale: { select: { number: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const now = new Date();
    const debts = installments.map((inst) => ({ inst, state: installmentState(inst, now) }));
    return {
      ...toResponse(customer),
      stats: {
        salesCount: totals._count,
        totalSpent: (totals._sum.total ?? new Prisma.Decimal(0))
          .sub(refunds._sum.refundTotal ?? 0)
          .toFixed(2),
        lastPurchaseAt: totals._max.date,
        debt: sumFixed(debts.map((d) => d.state.remaining)),
        overdue: sumFixed(debts.map((d) => d.state.overdueAmount)),
      },
      sales: sales.map((sale) => ({
        ...sale,
        total: sale.total.toFixed(2),
        displayNumber: formatDocumentNumber(DocumentPrefix.SALE, sale.number),
      })),
      installments: debts.map(({ inst, state }) => ({
        id: inst.id,
        saleDisplayNumber: formatDocumentNumber(DocumentPrefix.SALE, inst.sale.number),
        remaining: state.remaining.toFixed(2),
        overdueAmount: state.overdueAmount.toFixed(2),
        nextDueDate: state.nextDueDate,
      })),
    };
  }

  /** Остаток долга по активным рассрочкам для списка клиентов (одним запросом). */
  private async debts(ctx: AuthContext, ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const branchIds = ctx.allBranches ? null : [...ctx.branchIds];
    const rows = await this.prisma.$queryRaw<Array<{ customer_id: string; debt: Prisma.Decimal }>>`
      SELECT customer_id, SUM(total - paid_amount - reduced_amount) AS debt
      FROM installments
      WHERE company_id = ${ctx.companyId}::uuid AND status = 'ACTIVE'
        AND customer_id = ANY(${ids}::uuid[])
        AND (${branchIds}::uuid[] IS NULL OR branch_id = ANY(${branchIds}::uuid[]))
      GROUP BY customer_id`;
    return new Map(rows.map((r) => [r.customer_id, new Prisma.Decimal(r.debt).toFixed(2)]));
  }

  async create(ctx: AuthContext, dto: CreateCustomerDto) {
    const row = await this.prisma.customer.create({
      data: {
        companyId: ctx.companyId,
        name: dto.name,
        phone: dto.phone ?? null,
        telegramId: dto.telegramId ? BigInt(dto.telegramId) : null,
        notes: dto.notes ?? null,
      },
      select: customerSelect,
    });
    return toResponse(row);
  }

  async update(ctx: AuthContext, id: string, dto: UpdateCustomerDto) {
    await this.assertInCompany(ctx, id);
    const { telegramId, ...rest } = dto;
    const row = await this.prisma.customer.update({
      where: { id },
      data: {
        ...rest,
        ...(telegramId !== undefined ? { telegramId: telegramId ? BigInt(telegramId) : null } : {}),
      },
      select: customerSelect,
    });
    return toResponse(row);
  }

  async assertInCompany(ctx: AuthContext, id: string): Promise<void> {
    const found = await this.prisma.customer.count({ where: { id, companyId: ctx.companyId } });
    if (!found) {
      throw new AppException(
        ErrorCode.CUSTOMER_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Customer not found',
      );
    }
  }
}

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
@RequirePermissions(Permission.CUSTOMERS_MANAGE)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'Клиенты: поиск по имени и телефону' })
  list(@CurrentAuth() ctx: AuthContext, @Query() query: CustomersQuery) {
    return this.customers.list(ctx, query.q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Карточка клиента: покупки, сумма, долг по рассрочкам' })
  card(@CurrentAuth() ctx: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.customers.card(ctx, id);
  }

  @Post()
  @ApiOperation({ summary: 'Добавить клиента' })
  create(@CurrentAuth() ctx: AuthContext, @Body() dto: CreateCustomerDto) {
    return this.customers.create(ctx, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Изменить клиента' })
  update(
    @CurrentAuth() ctx: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customers.update(ctx, id, dto);
  }
}

@Module({
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
