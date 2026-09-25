import {
  Body,
  Controller,
  Delete,
  Get,
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
import { BrandsService } from './brands.service.js';
import {
  AddBarcodeDto,
  CreateBrandDto,
  CreateCategoryDto,
  CreateProductDto,
  IncludeInactiveQuery,
  ListProductsQuery,
  SerialCheckQuery,
  UpdateBrandDto,
  UpdateCategoryDto,
  UpdateProductDto,
  UpdateVariantDto,
  VariantInputDto,
} from './catalog.dto.js';
import { CategoriesService } from './categories.service.js';
import { ProductsService } from './products.service.js';
import { SerialNumbersService } from './serial-numbers.service.js';

const uuid = new ParseUUIDPipe();

@ApiTags('categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'Категории товаров' })
  list(@CurrentAuth() ctx: AuthContext, @Query() query: IncludeInactiveQuery) {
    return this.categories.list(ctx, query.includeInactive);
  }

  @Post()
  @RequirePermissions(Permission.PRODUCTS_MANAGE)
  @ApiOperation({ summary: 'Создать категорию' })
  create(@CurrentAuth() ctx: AuthContext, @Body() dto: CreateCategoryDto) {
    return this.categories.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.PRODUCTS_MANAGE)
  @ApiOperation({ summary: 'Изменить или отключить категорию' })
  update(
    @CurrentAuth() ctx: AuthContext,
    @Param('id', uuid) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categories.update(ctx, id, dto);
  }
}

@ApiTags('brands')
@ApiBearerAuth()
@Controller('brands')
export class BrandsController {
  constructor(private readonly brands: BrandsService) {}

  @Get()
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'Бренды' })
  list(@CurrentAuth() ctx: AuthContext, @Query() query: IncludeInactiveQuery) {
    return this.brands.list(ctx, query.includeInactive);
  }

  @Post()
  @RequirePermissions(Permission.PRODUCTS_MANAGE)
  @ApiOperation({ summary: 'Создать бренд' })
  create(@CurrentAuth() ctx: AuthContext, @Body() dto: CreateBrandDto) {
    return this.brands.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.PRODUCTS_MANAGE)
  @ApiOperation({ summary: 'Изменить или отключить бренд' })
  update(
    @CurrentAuth() ctx: AuthContext,
    @Param('id', uuid) id: string,
    @Body() dto: UpdateBrandDto,
  ) {
    return this.brands.update(ctx, id, dto);
  }
}

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'Товары: список и поиск (название, SKU, штрихкод, IMEI)' })
  list(@CurrentAuth() ctx: AuthContext, @Query() query: ListProductsQuery) {
    return this.products.list(ctx, query);
  }

  @Get('barcode/:code')
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'Найти товар по отсканированному штрихкоду' })
  byBarcode(@CurrentAuth() ctx: AuthContext, @Param('code') code: string) {
    return this.products.findByBarcode(ctx, code);
  }

  @Patch('variants/:variantId')
  @RequirePermissions(Permission.PRODUCTS_MANAGE)
  @ApiOperation({ summary: 'Изменить вариант товара' })
  updateVariant(
    @CurrentAuth() ctx: AuthContext,
    @Param('variantId', uuid) variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.products.updateVariant(ctx, variantId, dto);
  }

  @Post('variants/:variantId/barcodes')
  @RequirePermissions(Permission.PRODUCTS_MANAGE)
  @ApiOperation({ summary: 'Добавить штрихкод варианту' })
  addBarcode(
    @CurrentAuth() ctx: AuthContext,
    @Param('variantId', uuid) variantId: string,
    @Body() dto: AddBarcodeDto,
  ) {
    return this.products.addBarcode(ctx, variantId, dto.code);
  }

  @Delete('barcodes/:barcodeId')
  @RequirePermissions(Permission.PRODUCTS_MANAGE)
  @ApiOperation({ summary: 'Удалить штрихкод' })
  removeBarcode(@CurrentAuth() ctx: AuthContext, @Param('barcodeId', uuid) barcodeId: string) {
    return this.products.removeBarcode(ctx, barcodeId);
  }

  @Get(':id')
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'Товар с вариантами и штрихкодами' })
  get(@CurrentAuth() ctx: AuthContext, @Param('id', uuid) id: string) {
    return this.products.get(ctx, id);
  }

  @Post()
  @RequirePermissions(Permission.PRODUCTS_MANAGE)
  @ApiOperation({ summary: 'Создать товар с вариантами и штрихкодами' })
  create(@CurrentAuth() ctx: AuthContext, @Body() dto: CreateProductDto) {
    return this.products.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.PRODUCTS_MANAGE)
  @ApiOperation({ summary: 'Изменить или отключить товар' })
  update(
    @CurrentAuth() ctx: AuthContext,
    @Param('id', uuid) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(ctx, id, dto);
  }

  @Post(':id/variants')
  @RequirePermissions(Permission.PRODUCTS_MANAGE)
  @ApiOperation({ summary: 'Добавить вариант товара' })
  addVariant(
    @CurrentAuth() ctx: AuthContext,
    @Param('id', uuid) id: string,
    @Body() dto: VariantInputDto,
  ) {
    return this.products.addVariant(ctx, id, dto);
  }
}

@ApiTags('serial-numbers')
@ApiBearerAuth()
@Controller('serial-numbers')
export class SerialNumbersController {
  constructor(private readonly serials: SerialNumbersService) {}

  @Get('check')
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'Проверить IMEI / серийный номер: формат и дубликаты' })
  check(@CurrentAuth() ctx: AuthContext, @Query() query: SerialCheckQuery) {
    return this.serials.check(ctx, query.number, query.type);
  }

  @Get(':number')
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'Быстрый поиск по IMEI / серийному номеру' })
  find(@CurrentAuth() ctx: AuthContext, @Param('number') number: string) {
    return this.serials.find(ctx, number);
  }
}
