import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsTimeZone, Length, Matches } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateCompanyDto {
  @ApiPropertyOptional({ example: 'Techno House' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 200)
  name?: string;

  @ApiPropertyOptional({ example: 'UZS', description: 'Код валюты ISO 4217' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @ApiPropertyOptional({ example: 'Asia/Tashkent' })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}
