import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PASSWORD_MIN_LENGTH } from '@myshop/shared';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class TelegramLoginDto {
  @ApiProperty({ description: 'window.Telegram.WebApp.initData (строка как есть)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  initData: string;

  @ApiPropertyOptional({
    description: 'Компания для входа, если пользователь работает в нескольких',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}

const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** initData из Telegram (необязательно): если передан — аккаунт привязывается к Telegram. */
class WithOptionalInitData {
  @ApiPropertyOptional({ description: 'window.Telegram.WebApp.initData, если вход из Telegram' })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  initData?: string;
}

export class RegisterDto extends WithOptionalInitData {
  @ApiProperty({ example: 'Apple Store', description: 'Название бренда (уникально)' })
  @Transform(trim)
  @IsString()
  @Length(2, 200)
  companyName: string;

  @ApiProperty({ example: 'owner@example.com', description: 'Логин владельца' })
  @Transform(lower)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'secret123', minLength: PASSWORD_MIN_LENGTH })
  @IsString()
  @Length(PASSWORD_MIN_LENGTH, 128)
  password: string;

  @ApiPropertyOptional({ example: 'Сардор', description: 'Имя владельца' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  firstName?: string;
}

export class PasswordLoginDto extends WithOptionalInitData {
  @ApiProperty({ example: 'owner@example.com' })
  @Transform(lower)
  @IsString()
  @Length(3, 254)
  email: string;

  @ApiProperty()
  @IsString()
  @Length(1, 128)
  password: string;
}

export class StaffLoginDto extends WithOptionalInitData {
  @ApiProperty({ example: 'Apple Store', description: 'Название компании (бренд)' })
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  companyName: string;

  @ApiProperty({ example: 'ali' })
  @Transform(lower)
  @IsString()
  @Length(1, 64)
  login: string;

  @ApiProperty()
  @IsString()
  @Length(1, 128)
  password: string;
}

export class DevLoginDto {
  @ApiProperty({ example: '900000001', description: 'Telegram ID демо-пользователя' })
  @IsString()
  @Matches(/^\d{1,20}$/)
  telegramId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  companyId?: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  refreshToken: string;
}

export class SwitchCompanyDto {
  @ApiProperty()
  @IsUUID()
  companyId: string;
}
