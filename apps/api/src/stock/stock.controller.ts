import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Permission } from '@myshop/shared';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { StockService } from './stock.service.js';

export class StockBalancesQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Только товары, которые заканчиваются' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  lowOnly?: boolean;
}

export class StockMovementsQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  purchaseId?: string;
}

/**
 * Только чтение. Изменить остаток напрямую нельзя — только документами
 * (приход, продажа, возврат, перемещение, списание, инвентаризация).
 */
@ApiTags('stock')
@ApiBearerAuth()
@Controller('stock')
@RequirePermissions(Permission.STOCK_VIEW)
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get()
  @ApiOperation({ summary: 'Остатки по филиалам (с себестоимостью и признаком "заканчивается")' })
  balances(@CurrentAuth() ctx: AuthContext, @Query() query: StockBalancesQuery) {
    return this.stock.balances(ctx, query);
  }

  @Get('movements')
  @ApiOperation({ summary: 'История движений товара' })
  movements(@CurrentAuth() ctx: AuthContext, @Query() query: StockMovementsQuery) {
    return this.stock.movements(ctx, query);
  }
}
