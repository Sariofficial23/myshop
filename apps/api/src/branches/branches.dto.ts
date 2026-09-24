import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateBranchDto {
  @ApiProperty({ example: 'Yunusabad' })
  @Transform(trim)
  @IsString()
  @Length(2, 200)
  name: string;

  @ApiPropertyOptional({ example: 'Ташкент, Юнусабад-4' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsOptional()
  @Transform(emptyToNull)
  @Matches(/^\+?[\d\s()-]{5,32}$/)
  phone?: string | null;
}

export class UpdateBranchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @Matches(/^\+?[\d\s()-]{5,32}$/)
  phone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListBranchesQuery {
  @ApiPropertyOptional({
    description: 'Показать и отключённые филиалы (нужно право branches.manage)',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeInactive?: boolean;
}
