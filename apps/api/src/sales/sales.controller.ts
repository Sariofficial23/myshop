import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Permission } from '@myshop/shared';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import {
  accessibleBranchWhere,
  assertBranchAccess,
  type AuthContext,
} from '../auth/auth-context.js';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateSaleDto, ListSalesQuery } from './sales.dto.js';
import { SalesService } from './sales.service.js';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  @RequirePermissions(Permission.SALES_VIEW)
  @ApiOperation({ summary: 'Продажи' })
  list(@CurrentAuth() ctx: AuthContext, @Query() query: ListSalesQuery) {
    return this.sales.list(ctx, query);
  }

  @Get(':id')
  @RequirePermissions(Permission.SALES_VIEW)
  @ApiOperation({ summary: 'Продажа (чек)' })
  get(@CurrentAuth() ctx: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.sales.get(ctx, id);
  }

  @Post()
  @RequirePermissions(Permission.SALES_CREATE)
  @ApiOperation({ summary: 'Оформить продажу: списание, IMEI → SOLD, оплата, гарантия' })
  create(@CurrentAuth() ctx: AuthContext, @Body() dto: CreateSaleDto) {
    return this.sales.create(ctx, dto);
  }
}

export class ListPaymentsQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ example: '2026-09-25' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-25' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;
}

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(Permission.SALES_VIEW)
  @ApiOperation({ summary: 'Платежи по продажам' })
  async list(@CurrentAuth() ctx: AuthContext, @Query() query: ListPaymentsQuery) {
    if (query.branchId) assertBranchAccess(ctx, query.branchId);
    const to = query.to ? new Date(query.to) : undefined;
    to?.setUTCHours(23, 59, 59, 999);
    const rows = await this.prisma.payment.findMany({
      where: {
        companyId: ctx.companyId,
        sale: {
          branch: accessibleBranchWhere(ctx),
          ...(query.branchId ? { branchId: query.branchId } : {}),
        },
        ...(query.from || to
          ? {
              createdAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      include: {
        sale: { select: { id: true, number: true, branch: { select: { id: true, name: true } } } },
        receivedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: query.take ?? 100,
    });
    return rows.map((row) => ({ ...row, amount: row.amount.toFixed(2) }));
  }
}
