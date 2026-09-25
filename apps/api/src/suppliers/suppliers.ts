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
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { accessibleBranchWhere, type AuthContext } from '../auth/auth-context.js';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { IncludeInactiveQuery } from '../catalog/catalog.dto.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateSupplierDto {
  @ApiProperty({ example: 'Samsung Uzbekistan' })
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  name: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsOptional()
  @Transform(emptyToNull)
  @Matches(/^\+?[\d\s()-]{5,32}$/)
  phone?: string | null;

  @ApiPropertyOptional({ example: 'Азиз, менеджер' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(200)
  contact?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class UpdateSupplierDto extends CreateSupplierDto {
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

const supplierSelect = {
  id: true,
  name: true,
  phone: true,
  contact: true,
  notes: true,
  isActive: true,
} as const;

/** Поставщики: список, карточка с историей приходов. */
@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  list(ctx: AuthContext, includeInactive = false) {
    return this.prisma.supplier.findMany({
      where: { companyId: ctx.companyId, ...(includeInactive ? {} : { isActive: true }) },
      select: supplierSelect,
      orderBy: { name: 'asc' },
    });
  }

  /** Карточка поставщика: проведённые приходы в доступных филиалах и их сумма. */
  async card(ctx: AuthContext, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, companyId: ctx.companyId },
      select: supplierSelect,
    });
    if (!supplier) {
      throw new AppException(
        ErrorCode.SUPPLIER_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Supplier not found',
      );
    }
    const where = {
      companyId: ctx.companyId,
      supplierId: id,
      branch: accessibleBranchWhere(ctx),
    };
    const [purchases, totals] = await Promise.all([
      this.prisma.purchase.findMany({
        where,
        select: {
          id: true,
          number: true,
          date: true,
          status: true,
          total: true,
          documentNumber: true,
          branch: { select: { id: true, name: true } },
        },
        orderBy: { date: 'desc' },
        take: 20,
      }),
      this.prisma.purchase.aggregate({
        where: { ...where, status: 'CONFIRMED' },
        _sum: { total: true },
        _count: true,
        _max: { date: true },
      }),
    ]);
    return {
      ...supplier,
      stats: {
        purchasesCount: totals._count,
        totalPurchased: totals._sum.total?.toFixed(2) ?? '0.00',
        lastPurchaseAt: totals._max.date,
      },
      purchases: purchases.map((p) => ({
        ...p,
        total: p.total.toFixed(2),
        displayNumber: formatDocumentNumber(DocumentPrefix.PURCHASE, p.number),
      })),
    };
  }

  create(ctx: AuthContext, dto: CreateSupplierDto) {
    return this.prisma.supplier.create({
      data: { companyId: ctx.companyId, ...dto },
      select: supplierSelect,
    });
  }

  async update(ctx: AuthContext, id: string, dto: UpdateSupplierDto) {
    await this.assertInCompany(ctx, id);
    return this.prisma.supplier.update({ where: { id }, data: dto, select: supplierSelect });
  }

  async assertInCompany(ctx: AuthContext, id: string): Promise<void> {
    const found = await this.prisma.supplier.count({ where: { id, companyId: ctx.companyId } });
    if (!found) {
      throw new AppException(
        ErrorCode.SUPPLIER_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Supplier not found',
      );
    }
  }
}

@ApiTags('suppliers')
@ApiBearerAuth()
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @RequirePermissions(Permission.PURCHASES_MANAGE)
  @ApiOperation({ summary: 'Поставщики' })
  list(@CurrentAuth() ctx: AuthContext, @Query() query: IncludeInactiveQuery) {
    return this.suppliers.list(ctx, query.includeInactive);
  }

  @Get(':id')
  @RequirePermissions(Permission.PURCHASES_MANAGE)
  @ApiOperation({ summary: 'Карточка поставщика: приходы и их сумма' })
  card(@CurrentAuth() ctx: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.suppliers.card(ctx, id);
  }

  @Post()
  @RequirePermissions(Permission.SUPPLIERS_MANAGE)
  @ApiOperation({ summary: 'Добавить поставщика' })
  create(@CurrentAuth() ctx: AuthContext, @Body() dto: CreateSupplierDto) {
    return this.suppliers.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.SUPPLIERS_MANAGE)
  @ApiOperation({ summary: 'Изменить поставщика' })
  update(
    @CurrentAuth() ctx: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.suppliers.update(ctx, id, dto);
  }
}

@Module({
  controllers: [SuppliersController],
  providers: [SuppliersService],
  exports: [SuppliersService],
})
export class SuppliersModule {}
