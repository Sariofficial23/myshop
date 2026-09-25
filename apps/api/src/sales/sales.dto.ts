import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PAYMENT_METHODS, type PaymentMethod } from '@myshop/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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

export class SaleItemDto {
  @ApiProperty()
  @IsUUID()
  variantId: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'Для товаров с IMEI вычисляется по числу номеров',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity?: number;

  @ApiPropertyOptional({
    example: '11990000',
    description:
      'Цена за единицу. По умолчанию — цена продажи варианта; изменить может менеджер/владелец',
  })
  @IsOptional()
  @Transform(toPrice)
  @Matches(PRICE)
  price?: string | null;

  @ApiPropertyOptional({ example: '490000', description: 'Скидка на строку (сумма)' })
  @IsOptional()
  @Transform(toPrice)
  @Matches(PRICE)
  discount?: string | null;

  @ApiPropertyOptional({ type: [String], example: ['490154203237518'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  serialNumbers?: string[];
}

export class PaymentDto {
  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  method: PaymentMethod;

  @ApiProperty({ example: '11500000' })
  @Transform(toPrice)
  @Matches(PRICE)
  amount: string;
}

export class InstallmentOptionDto {
  @ApiProperty({ example: 6, description: 'Срок рассрочки в месяцах' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  months: number;

  @ApiPropertyOptional({
    example: '2026-10-25',
    description: 'Дата первого платежа (по умолчанию через месяц)',
  })
  @IsOptional()
  @IsDateString()
  firstDueDate?: string;
}

export class CreateSaleDto {
  @ApiProperty()
  @IsUUID()
  branchId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @ApiProperty({ type: [SaleItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @ApiProperty({
    type: [PaymentDto],
    description:
      'Несколько платежей разными способами = смешанная оплата. В рассрочку — первоначальный взнос (можно пусто)',
  })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  payments: PaymentDto[];

  @ApiPropertyOptional({
    type: InstallmentOptionDto,
    description: 'Продажа в рассрочку: нужен клиент, оплачивается только взнос',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => InstallmentOptionDto)
  installment?: InstallmentOptionDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class ListSalesQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sellerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

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
