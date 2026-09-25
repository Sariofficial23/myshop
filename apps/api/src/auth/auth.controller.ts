import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthResponse, MeResponse } from '@myshop/shared';
import type { Request } from 'express';
import type { AuthContext } from './auth-context.js';
import { AuthService } from './auth.service.js';
import { CurrentAuth } from './decorators/current-auth.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { AllowWithoutSubscription } from './decorators/allow-without-subscription.decorator.js';
import {
  DevLoginDto,
  PasswordLoginDto,
  RefreshTokenDto,
  RegisterDto,
  StaffLoginDto,
  SwitchCompanyDto,
  TelegramLoginDto,
} from './dto/auth.dto.js';
import type { ClientMeta } from './session.service.js';

/** Строже общий лимит для эндпоинтов входа (защита от перебора). */
const AUTH_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

function clientMeta(req: Request): ClientMeta {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('telegram')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Вход через Telegram Mini App (проверка подписи initData)' })
  telegram(@Body() dto: TelegramLoginDto, @Req() req: Request): Promise<AuthResponse> {
    return this.auth.loginWithTelegram(dto.initData, dto.companyId, clientMeta(req));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({
    summary: 'Регистрация владельца: бренд + email + пароль (компания ждёт активации)',
  })
  register(@Body() dto: RegisterDto, @Req() req: Request): Promise<AuthResponse> {
    return this.auth.register(dto, clientMeta(req));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Вход владельца по email и паролю' })
  login(@Body() dto: PasswordLoginDto, @Req() req: Request): Promise<AuthResponse> {
    return this.auth.loginWithPassword(dto, clientMeta(req));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('staff-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Вход сотрудника: название компании + логин + пароль' })
  staffLogin(@Body() dto: StaffLoginDto, @Req() req: Request): Promise<AuthResponse> {
    return this.auth.loginStaff(dto, clientMeta(req));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('dev-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Вход по демо-пользователю (только AUTH_DEV_LOGIN_ENABLED=true, не в production)',
  })
  devLogin(@Body() dto: DevLoginDto, @Req() req: Request): Promise<AuthResponse> {
    return this.auth.devLogin(dto.telegramId, dto.companyId, clientMeta(req));
  }

  @Public()
  @Get('dev/users')
  @ApiOperation({ summary: 'Список демо-пользователей для dev-login' })
  devUsers() {
    return this.auth.listDevUsers();
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Обновить токены (refresh token ротируется)' })
  refresh(@Body() dto: RefreshTokenDto, @Req() req: Request): Promise<AuthResponse> {
    return this.auth.refresh(dto.refreshToken, clientMeta(req));
  }

  @ApiBearerAuth()
  @AllowWithoutSubscription()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Выйти (отозвать текущую сессию)' })
  async logout(@CurrentAuth() ctx: AuthContext): Promise<void> {
    await this.auth.logout(ctx);
  }

  @ApiBearerAuth()
  @AllowWithoutSubscription()
  @Get('me')
  @ApiOperation({ summary: 'Текущий пользователь, компания, роль, права, филиалы' })
  me(@CurrentAuth() ctx: AuthContext): Promise<MeResponse> {
    return this.auth.buildMe(ctx.membershipId);
  }

  @ApiBearerAuth()
  @AllowWithoutSubscription()
  @Post('switch-company')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Переключиться на другую компанию пользователя' })
  switchCompany(
    @CurrentAuth() ctx: AuthContext,
    @Body() dto: SwitchCompanyDto,
    @Req() req: Request,
  ): Promise<AuthResponse> {
    return this.auth.switchCompany(ctx, dto.companyId, clientMeta(req));
  }
}
