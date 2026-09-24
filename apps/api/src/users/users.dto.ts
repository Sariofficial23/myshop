import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role, ROLES } from '@myshop/shared';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateUserDto {
  @ApiProperty({ example: 'Алишер' })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  firstName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @Length(1, 100)
  lastName?: string | null;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsOptional()
  @Transform(emptyToNull)
  @Matches(/^\+?[\d\s()-]{5,32}$/)
  phone?: string | null;

  @ApiPropertyOptional({
    example: '123456789',
    description: 'Telegram ID сотрудника — по нему он входит в Mini App',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @Matches(/^\d{1,20}$/)
  telegramId?: string | null;

  @ApiProperty({ enum: ROLES })
  @IsIn(ROLES)
  role: Role;

  @ApiPropertyOptional({ description: 'Доступ ко всем филиалам' })
  @IsOptional()
  @IsBoolean()
  allBranches?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  branchIds?: string[];

  @ApiPropertyOptional({ type: [String], example: ['returns.create'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  extraPermissions?: string[];
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @Length(1, 100)
  lastName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @Matches(/^\+?[\d\s()-]{5,32}$/)
  phone?: string | null;

  @ApiPropertyOptional({ description: 'Можно указать, только если Telegram ещё не привязан' })
  @IsOptional()
  @Matches(/^\d{1,20}$/)
  telegramId?: string;

  @ApiPropertyOptional({ enum: ROLES })
  @IsOptional()
  @IsIn(ROLES)
  role?: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allBranches?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  branchIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  extraPermissions?: string[];

  @ApiPropertyOptional({ description: 'false — заблокировать сотрудника' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
