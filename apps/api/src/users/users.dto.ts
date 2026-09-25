import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PASSWORD_MIN_LENGTH, Role, ROLES } from '@myshop/shared';
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
const lowerOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() || null : value;

/** Логин сотрудника: латиница, цифры, точка, дефис, подчёркивание. */
const LOGIN = /^[a-z0-9._-]{3,32}$/;

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

  @ApiPropertyOptional({
    example: 'ali',
    description: 'Логин для входа (вместе с названием компании и паролем)',
  })
  @IsOptional()
  @Transform(lowerOrNull)
  @Matches(LOGIN)
  login?: string | null;

  @ApiPropertyOptional({ minLength: PASSWORD_MIN_LENGTH, description: 'Пароль для входа' })
  @IsOptional()
  @IsString()
  @Length(PASSWORD_MIN_LENGTH, 128)
  password?: string;

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

  @ApiPropertyOptional({
    example: 'ali',
    description: 'Логин для входа (вместе с названием компании и паролем)',
  })
  @IsOptional()
  @Transform(lowerOrNull)
  @Matches(LOGIN)
  login?: string | null;

  @ApiPropertyOptional({ minLength: PASSWORD_MIN_LENGTH, description: 'Пароль для входа' })
  @IsOptional()
  @IsString()
  @Length(PASSWORD_MIN_LENGTH, 128)
  password?: string;

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
