import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@myshop/shared';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { CreatePurchaseDto, ListPurchasesQuery, UpdatePurchaseDto } from './purchases.dto.js';
import { PurchasesService } from './purchases.service.js';

const uuid = new ParseUUIDPipe();

@ApiTags('purchases')
@ApiBearerAuth()
@Controller('purchases')
@RequirePermissions(Permission.PURCHASES_MANAGE)
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get()
  @ApiOperation({ summary: 'Приходы' })
  list(@CurrentAuth() ctx: AuthContext, @Query() query: ListPurchasesQuery) {
    return this.purchases.list(ctx, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Приход с позициями' })
  get(@CurrentAuth() ctx: AuthContext, @Param('id', uuid) id: string) {
    return this.purchases.get(ctx, id);
  }

  @Post()
  @ApiOperation({ summary: 'Создать приход (черновик; confirm=true — сразу провести)' })
  create(@CurrentAuth() ctx: AuthContext, @Body() dto: CreatePurchaseDto) {
    return this.purchases.create(ctx, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Изменить черновик прихода' })
  update(
    @CurrentAuth() ctx: AuthContext,
    @Param('id', uuid) id: string,
    @Body() dto: UpdatePurchaseDto,
  ) {
    return this.purchases.update(ctx, id, dto);
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Провести приход: остатки, IMEI, себестоимость, цена продажи' })
  confirm(@CurrentAuth() ctx: AuthContext, @Param('id', uuid) id: string) {
    return this.purchases.confirm(ctx, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Отменить черновик прихода' })
  cancel(@CurrentAuth() ctx: AuthContext, @Param('id', uuid) id: string) {
    return this.purchases.cancel(ctx, id);
  }
}
