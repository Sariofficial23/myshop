import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DOCUMENT_STATUSES, type DocumentStatus } from '@myshop/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const PRICE = /^\d{1,12}(\.\d{1,2})?$/;
const toPrice = ({ value }: { value: unknown }) =>
  typeof value === 'number'
    ? String(value)
    : typeof value === 'string'
      ? value.trim() || null
      : value;
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class PurchaseItemDto {
  @ApiProperty()
  @IsUUID()
  variantId: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  quantity: number;

  @ApiProperty({ example: '10500000', description: 'Цена закупки за единицу' })
  @Transform(toPrice)
  @Matches(PRICE)
  purchasePrice: string;

  @ApiPropertyOptional({ example: '11990000', description: 'Новая цена продажи' })
  @IsOptional()
  @Transform(toPrice)
  @Matches(PRICE)
  salePrice?: string | null;

  @ApiPropertyOptional({
    type: [String],
    example: ['490154203237518', '356938035643809'],
    description: 'IMEI / серийные номера: ровно quantity штук для товаров с учётом по номеру',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  serialNumbers?: string[];
}

class PurchaseFieldsDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  supplierId?: string | null;

  @ApiPropertyOptional({ example: 'НК-2045', description: 'Номер накладной поставщика' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(64)
  documentNumber?: string | null;

  @ApiPropertyOptional({ example: '2026-09-25' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class CreatePurchaseDto extends PurchaseFieldsDto {
  @ApiProperty()
  @IsUUID()
  branchId: string;

  @ApiProperty({ type: [PurchaseItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items: PurchaseItemDto[];

  @ApiPropertyOptional({ description: 'Сразу провести документ (остатки изменятся)' })
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}

export class UpdatePurchaseDto extends PurchaseFieldsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ type: [PurchaseItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items?: PurchaseItemDto[];
}

export class ListPurchasesQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ enum: DOCUMENT_STATUSES })
  @IsOptional()
  @IsIn(DOCUMENT_STATUSES)
  status?: DocumentStatus;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  to?: string;

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
