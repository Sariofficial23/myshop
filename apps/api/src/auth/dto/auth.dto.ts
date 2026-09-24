import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
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

export class TelegramRegisterDto {
  @ApiProperty({ description: 'window.Telegram.WebApp.initData' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  initData: string;

  @ApiProperty({ example: 'Techno House' })
  @Transform(trim)
  @IsString()
  @Length(2, 200)
  companyName: string;

  @ApiPropertyOptional({ example: 'Chilanzar', description: 'Название первого филиала' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 200)
  branchName?: string;
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
