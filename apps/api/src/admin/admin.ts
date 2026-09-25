import {
  Body,
  type CanActivate,
  createParamDecorator,
  Controller,
  type ExecutionContext,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiHeader,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { CompanyStatus, ErrorCode, subscriptionState } from '@myshop/shared';
import type { Prisma } from '@myshop/database';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import {
  InitDataError,
  type TelegramUser,
  validateTelegramInitData,
} from '../auth/telegram-init-data.js';
import { AppException } from '../common/errors/app.exception.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { addMonths } from '../sales/sale-calc.js';

export const ADMIN_INIT_DATA_HEADER = 'x-telegram-init-data';

type AdminRequest = Request & { platformAdmin?: TelegramUser };

/**
 * Доступ администратора платформы: каждый запрос несёт подписанный Telegram initData,
 * id пользователя должен быть в PLATFORM_ADMIN_TELEGRAM_IDS. Сессии и пароли не нужны.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const initData = request.headers[ADMIN_INIT_DATA_HEADER];
    const botToken = this.config.get('TELEGRAM_BOT_TOKEN', { infer: true });
    if (typeof initData !== 'string' || !initData || !botToken) {
      throw new AppException(ErrorCode.NOT_PLATFORM_ADMIN, HttpStatus.FORBIDDEN, 'Admins only');
    }
    let user: TelegramUser;
    try {
      user = validateTelegramInitData(initData, botToken, {
        maxAgeSeconds: this.config.get('TELEGRAM_INIT_DATA_MAX_AGE_SECONDS', { infer: true }),
      }).user;
    } catch (error) {
      throw new AppException(
        error instanceof InitDataError && error.reason === 'expired'
          ? ErrorCode.INIT_DATA_EXPIRED
          : ErrorCode.INVALID_INIT_DATA,
        HttpStatus.UNAUTHORIZED,
        'Invalid initData',
      );
    }
    const admins = this.config.get('PLATFORM_ADMIN_TELEGRAM_IDS', { infer: true });
    if (!admins.includes(String(user.id))) {
      throw new AppException(ErrorCode.NOT_PLATFORM_ADMIN, HttpStatus.FORBIDDEN, 'Admins only');
    }
    request.platformAdmin = user;
    return true;
  }
}

const STATUSES = Object.values(CompanyStatus);

export class ListCompaniesQuery {
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: CompanyStatus;
}

export class ExtendDto {
  @ApiProperty({
    example: 1,
    description: 'На сколько месяцев продлить (с сегодня или с конца оплаты)',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(36)
  months: number;
}

const companyInclude = {
  memberships: {
    where: { role: 'OWNER' },
    orderBy: { createdAt: 'asc' },
    take: 1,
    include: {
      user: {
        select: { firstName: true, lastName: true, email: true, username: true, telegramId: true },
      },
    },
  },
  _count: { select: { memberships: true, branches: true, sales: true } },
} satisfies Prisma.CompanyInclude;
type CompanyRow = Prisma.CompanyGetPayload<{ include: typeof companyInclude }>;

function toCompany(c: CompanyRow) {
  const owner = c.memberships[0]?.user;
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    state: subscriptionState(c.status, c.paidUntil),
    paidUntil: c.paidUntil,
    createdAt: c.createdAt,
    owner: owner
      ? {
          name: [owner.firstName, owner.lastName].filter(Boolean).join(' '),
          email: owner.email,
          username: owner.username,
          telegramId: owner.telegramId?.toString() ?? null,
        }
      : null,
    usersCount: c._count.memberships,
    branchesCount: c._count.branches,
    salesCount: c._count.sales,
  };
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListCompaniesQuery) {
    const rows = await this.prisma.company.findMany({
      where: query.status ? { status: query.status } : {},
      include: companyInclude,
      orderBy: [{ createdAt: 'desc' }],
      take: 500,
    });
    // Сначала новые заявки, затем остальные
    return rows
      .map(toCompany)
      .toSorted((a, b) => Number(b.status === 'PENDING') - Number(a.status === 'PENDING'));
  }

  /** Продлить (и при необходимости активировать): от конца оплаты или от сегодня, если истекла. */
  async extend(admin: TelegramUser, id: string, months: number) {
    const company = await this.find(id);
    const now = new Date();
    const from = company.paidUntil && company.paidUntil > now ? company.paidUntil : now;
    const paidUntil = addMonths(from, months);
    return this.update(admin, id, { status: 'ACTIVE', paidUntil }, { months });
  }

  async block(admin: TelegramUser, id: string) {
    await this.find(id);
    return this.update(admin, id, { status: 'BLOCKED' });
  }

  async unblock(admin: TelegramUser, id: string) {
    await this.find(id);
    return this.update(admin, id, { status: 'ACTIVE' });
  }

  private async update(
    admin: TelegramUser,
    id: string,
    data: Prisma.CompanyUpdateInput,
    extra: Record<string, unknown> = {},
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.update({ where: { id }, data, include: companyInclude });
      await tx.auditLog.create({
        data: {
          companyId: id,
          action: 'UPDATE',
          entity: 'Subscription',
          entityId: id,
          newValue: {
            status: company.status,
            paidUntil: company.paidUntil?.toISOString() ?? null,
            byPlatformAdmin: String(admin.id),
            ...extra,
          },
        },
      });
      return company;
    });
    return toCompany(updated);
  }

  private async find(id: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) {
      throw new AppException(
        ErrorCode.COMPANY_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Company not found',
      );
    }
    return company;
  }
}

/** Администратор платформы, проверенный PlatformAdminGuard. */
const ReqAdmin = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<AdminRequest>().platformAdmin!,
);

@ApiTags('admin')
@ApiHeader({ name: ADMIN_INIT_DATA_HEADER, description: 'Telegram initData администратора' })
@Public()
@UseGuards(PlatformAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('me')
  @ApiOperation({ summary: 'Проверка: текущий пользователь Telegram — администратор платформы' })
  me(@ReqAdmin() user: TelegramUser) {
    return { telegramId: String(user.id), firstName: user.first_name };
  }

  @Get('companies')
  @ApiOperation({ summary: 'Все компании платформы: статус, оплата, владелец' })
  list(@Query() query: ListCompaniesQuery) {
    return this.admin.list(query);
  }

  @Post('companies/:id/extend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Активировать / продлить подписку на N месяцев' })
  extend(
    @ReqAdmin() user: TelegramUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ExtendDto,
  ) {
    return this.admin.extend(user, id, dto.months);
  }

  @Post('companies/:id/block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Заблокировать компанию' })
  block(@ReqAdmin() user: TelegramUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.admin.block(user, id);
  }

  @Post('companies/:id/unblock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Разблокировать компанию' })
  unblock(@ReqAdmin() user: TelegramUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.admin.unblock(user, id);
  }
}

@Module({ controllers: [AdminController], providers: [AdminService, PlatformAdminGuard] })
export class AdminModule {}
