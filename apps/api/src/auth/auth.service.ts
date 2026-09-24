import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type AuthResponse,
  ErrorCode,
  isLocale,
  type MeResponse,
  resolvePermissions,
} from '@myshop/shared';
import type { Membership } from '@myshop/database';
import { AppException } from '../common/errors/app.exception.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthContext } from './auth-context.js';
import { toAuthUser } from './auth.mappers.js';
import type { TelegramRegisterDto } from './dto/auth.dto.js';
import { type ClientMeta, SessionService } from './session.service.js';
import {
  InitDataError,
  type TelegramUser,
  validateTelegramInitData,
} from './telegram-init-data.js';

const DEFAULT_BRANCH_NAME = 'Основной магазин';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Вход через Telegram Mini App: подпись initData проверяется, telegram_id от клиента не принимается. */
  async loginWithTelegram(
    initData: string,
    companyId: string | undefined,
    meta: ClientMeta,
  ): Promise<AuthResponse> {
    const tgUser = this.verifyInitData(initData);
    const user = await this.prisma.user.findUnique({ where: { telegramId: BigInt(tgUser.id) } });
    if (!user) throw this.noMembership(tgUser.id);

    await this.prisma.user.update({ where: { id: user.id }, data: profileFromTelegram(tgUser) });
    return this.loginUser(user.id, companyId, meta, tgUser.id);
  }

  /**
   * Регистрация нового магазина (SaaS-онбординг): создаёт компанию, первый филиал
   * и делает пользователя владельцем. Всё в одной транзакции.
   */
  async registerWithTelegram(dto: TelegramRegisterDto, meta: ClientMeta): Promise<AuthResponse> {
    const tgUser = this.verifyInitData(dto.initData);
    const telegramId = BigInt(tgUser.id);

    const membership = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { telegramId },
        include: { memberships: { select: { id: true } } },
      });
      if (existing && !existing.isActive) {
        throw new AppException(
          ErrorCode.ACCOUNT_DISABLED,
          HttpStatus.FORBIDDEN,
          'Account is disabled',
        );
      }
      if (existing?.memberships.length) {
        throw new AppException(
          ErrorCode.ALREADY_REGISTERED,
          HttpStatus.CONFLICT,
          'User already belongs to a company',
        );
      }
      const user = existing
        ? await tx.user.update({ where: { id: existing.id }, data: profileFromTelegram(tgUser) })
        : await tx.user.create({ data: { telegramId, ...profileFromTelegram(tgUser) } });

      const company = await tx.company.create({ data: { name: dto.companyName } });
      await tx.branch.create({
        data: { companyId: company.id, name: dto.branchName ?? DEFAULT_BRANCH_NAME },
      });
      return tx.membership.create({
        data: { companyId: company.id, userId: user.id, role: 'OWNER', allBranches: true },
      });
    });

    return this.issueFor(membership, meta);
  }

  /** Вход без Telegram — только локальная разработка (AUTH_DEV_LOGIN_ENABLED). */
  async devLogin(
    telegramId: string,
    companyId: string | undefined,
    meta: ClientMeta,
  ): Promise<AuthResponse> {
    this.assertDevLoginEnabled();
    const user = await this.prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
    if (!user) throw this.noMembership(Number(telegramId));
    return this.loginUser(user.id, companyId, meta, Number(telegramId));
  }

  async listDevUsers() {
    this.assertDevLoginEnabled();
    const memberships = await this.prisma.membership.findMany({
      where: {
        isActive: true,
        user: { isActive: true, telegramId: { not: null } },
        company: { isActive: true },
      },
      include: { user: true, company: true },
      orderBy: [{ company: { name: 'asc' } }, { role: 'asc' }],
      take: 50,
    });
    return memberships.map((m) => ({
      telegramId: m.user.telegramId!.toString(),
      name: [m.user.firstName, m.user.lastName].filter(Boolean).join(' '),
      role: m.role,
      companyId: m.companyId,
      companyName: m.company.name,
    }));
  }

  async refresh(refreshToken: string, meta: ClientMeta): Promise<AuthResponse> {
    const { membershipId, tokens } = await this.sessions.rotate(refreshToken, meta);
    return { ...tokens, me: await this.buildMe(membershipId) };
  }

  async logout(ctx: AuthContext): Promise<void> {
    await this.sessions.revoke(ctx.sessionId);
  }

  async switchCompany(
    ctx: AuthContext,
    companyId: string,
    meta: ClientMeta,
  ): Promise<AuthResponse> {
    const response = await this.loginUser(ctx.userId, companyId, meta);
    if (response.me.company.id !== companyId) {
      throw new AppException(
        ErrorCode.COMPANY_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Company not found',
      );
    }
    await this.sessions.revoke(ctx.sessionId);
    return response;
  }

  /** Профиль, компания, роль, права и доступные филиалы текущего сотрудника. */
  async buildMe(membershipId: string): Promise<MeResponse> {
    const membership = await this.prisma.membership.findUniqueOrThrow({
      where: { id: membershipId },
      include: {
        user: {
          include: {
            memberships: {
              where: { isActive: true, company: { isActive: true } },
              include: { company: { select: { id: true, name: true } } },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        company: true,
        branches: { include: { branch: true } },
      },
    });

    const branches = membership.allBranches
      ? await this.prisma.branch.findMany({
          where: { companyId: membership.companyId, isActive: true },
          orderBy: { createdAt: 'asc' },
        })
      : membership.branches.map((b) => b.branch).filter((b) => b.isActive);

    return {
      user: toAuthUser(membership.user),
      company: {
        id: membership.company.id,
        name: membership.company.name,
        currency: membership.company.currency,
        timezone: membership.company.timezone,
      },
      role: membership.role,
      permissions: resolvePermissions(membership.role, membership.extraPermissions),
      branches: branches.map((b) => ({ id: b.id, name: b.name })),
      allBranches: membership.allBranches,
      memberships: membership.user.memberships.map((m) => ({
        companyId: m.company.id,
        companyName: m.company.name,
        role: m.role,
      })),
    };
  }

  private async loginUser(
    userId: string,
    companyId: string | undefined,
    meta: ClientMeta,
    telegramId?: number,
  ): Promise<AuthResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          where: { isActive: true, company: { isActive: true } },
          orderBy: [{ lastLoginAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'asc' }],
        },
      },
    });
    if (!user.isActive) {
      throw new AppException(
        ErrorCode.ACCOUNT_DISABLED,
        HttpStatus.FORBIDDEN,
        'Account is disabled',
      );
    }
    const membership = companyId
      ? user.memberships.find((m) => m.companyId === companyId)
      : user.memberships[0];
    if (!membership) throw this.noMembership(telegramId);

    return this.issueFor(membership, meta);
  }

  private async issueFor(membership: Membership, meta: ClientMeta): Promise<AuthResponse> {
    const { tokens } = await this.sessions.createSession(membership, meta);
    return { ...tokens, me: await this.buildMe(membership.id) };
  }

  private verifyInitData(initData: string): TelegramUser {
    const botToken = this.config.get('TELEGRAM_BOT_TOKEN', { infer: true });
    if (!botToken) {
      throw new AppException(
        ErrorCode.TELEGRAM_AUTH_NOT_CONFIGURED,
        HttpStatus.SERVICE_UNAVAILABLE,
        'TELEGRAM_BOT_TOKEN is not configured on the server',
      );
    }
    try {
      return validateTelegramInitData(initData, botToken, {
        maxAgeSeconds: this.config.get('TELEGRAM_INIT_DATA_MAX_AGE_SECONDS', { infer: true }),
      }).user;
    } catch (error) {
      if (error instanceof InitDataError && error.reason === 'expired') {
        throw new AppException(
          ErrorCode.INIT_DATA_EXPIRED,
          HttpStatus.UNAUTHORIZED,
          'initData expired',
        );
      }
      throw new AppException(
        ErrorCode.INVALID_INIT_DATA,
        HttpStatus.UNAUTHORIZED,
        'Invalid initData',
      );
    }
  }

  private assertDevLoginEnabled(): void {
    if (!this.config.get('AUTH_DEV_LOGIN_ENABLED', { infer: true })) {
      throw new AppException(
        ErrorCode.DEV_LOGIN_DISABLED,
        HttpStatus.FORBIDDEN,
        'Dev login is disabled',
      );
    }
  }

  /** Пользователь не состоит ни в одной компании — фронтенд предложит создать магазин. */
  private noMembership(telegramId?: number): AppException {
    return new AppException(
      ErrorCode.NO_MEMBERSHIP,
      HttpStatus.FORBIDDEN,
      'User is not a member of any company',
      telegramId ? { telegramId: String(telegramId) } : undefined,
    );
  }
}

interface TelegramProfile {
  firstName: string;
  lastName: string | null;
  username: string | null;
  languageCode?: string;
}

function profileFromTelegram(tgUser: TelegramUser): TelegramProfile {
  return {
    firstName: tgUser.first_name.slice(0, 100),
    lastName: tgUser.last_name?.slice(0, 100) ?? null,
    username: tgUser.username?.slice(0, 64) ?? null,
    languageCode: isLocale(tgUser.language_code) ? tgUser.language_code : undefined,
  };
}
