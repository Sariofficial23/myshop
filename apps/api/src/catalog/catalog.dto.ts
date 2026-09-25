import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PRODUCT_UNITS, type ProductUnit, SerialType } from '@myshop/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() || undefined : value;

const SKU_PATTERN = /^[A-Z0-9][A-Z0-9\-_./]{0,63}$/;
const PRICE_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;
const SERIAL_TYPES = [SerialType.IMEI, SerialType.SERIAL];

// ── Категории и бренды ─────────────────────────────────────

export class CreateCategoryDto {
  @ApiProperty({ example: 'Смартфоны' })
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  name: string;

  @ApiPropertyOptional({ description: 'Родительская категория' })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateBrandDto {
  @ApiProperty({ example: 'Apple' })
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  name: string;
}

export class UpdateBrandDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class IncludeInactiveQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeInactive?: boolean;
}

// ── Варианты ───────────────────────────────────────────────

class VariantFieldsDto {
  @ApiPropertyOptional({ example: 'IPH15-128-BLK', description: 'Если не указан — генерируется' })
  @IsOptional()
  @Transform(upper)
  @Matches(SKU_PATTERN)
  sku?: string;

  @ApiPropertyOptional({ example: '128GB Black' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(200)
  name?: string | null;

  @ApiPropertyOptional({ example: 'A3090' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(100)
  model?: string | null;

  @ApiPropertyOptional({ example: 'Black' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(60)
  color?: string | null;

  @ApiPropertyOptional({ example: '8GB', description: 'Оперативная память' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(30)
  memory?: string | null;

  @ApiPropertyOptional({ example: '128GB', description: 'Встроенная память' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(30)
  storage?: string | null;

  @ApiPropertyOptional({ example: { diagonal: '55"' } })
  @IsOptional()
  @IsObject()
  attributes?: Record<string, string>;

  @ApiPropertyOptional({ example: '12990000', description: 'Цена продажи' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'number' ? String(value) : emptyToNull({ value })))
  @Matches(PRICE_PATTERN)
  salePrice?: string | null;
}

export class VariantInputDto extends VariantFieldsDto {
  @ApiPropertyOptional({ type: [String], example: ['0195949036323'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  barcodes?: string[];
}

export class UpdateVariantDto extends VariantFieldsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AddBarcodeDto {
  @ApiProperty({ example: '4600000000017' })
  @IsString()
  @Length(1, 64)
  code: string;
}

// ── Товары ─────────────────────────────────────────────────

class ProductFieldsDto {
  @ApiPropertyOptional({ example: 'IPH15', description: 'Если не указан — генерируется' })
  @IsOptional()
  @Transform(upper)
  @Matches(SKU_PATTERN)
  sku?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  brandId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiPropertyOptional({ enum: PRODUCT_UNITS })
  @IsOptional()
  @IsIn(PRODUCT_UNITS)
  unit?: ProductUnit;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  minimumStock?: number;

  @ApiPropertyOptional({
    enum: SERIAL_TYPES,
    nullable: true,
    description: 'Учёт по IMEI / серийному номеру',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsIn([...SERIAL_TYPES, null])
  serialType?: SerialType | null;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  warrantyMonths?: number;
}

export class CreateProductDto extends ProductFieldsDto {
  @ApiProperty({ example: 'iPhone 15' })
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  name: string;

  @ApiPropertyOptional({
    type: [VariantInputDto],
    description: 'Варианты. Если не указаны — создаётся один вариант по умолчанию',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => VariantInputDto)
  variants?: VariantInputDto[];
}

export class UpdateProductDto extends ProductFieldsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListProductsQuery {
  @ApiPropertyOptional({ description: 'Поиск: название, SKU, штрихкод, IMEI' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  brandId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeInactive?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class SerialCheckQuery {
  @ApiProperty({ example: '490154203237518' })
  @IsString()
  @Length(1, 64)
  number: string;

  @ApiPropertyOptional({ enum: SERIAL_TYPES, default: SerialType.IMEI })
  @IsOptional()
  @IsIn(SERIAL_TYPES)
  type?: SerialType;
}
