import { createHash, randomBytes } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode, resolvePermissions, type AuthTokens } from '@myshop/shared';
import type { Prisma } from '@myshop/database';
import { AppException } from '../common/errors/app.exception.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthContext } from './auth-context.js';

export interface ClientMeta {
  userAgent?: string;
  ip?: string;
}

/** Повторное использование уже заменённого refresh token в пределах этого окна считаем гонкой вкладок. */
const ROTATION_GRACE_MS = 10_000;

function invalidRefreshToken(): AppException {
  return new AppException(
    ErrorCode.INVALID_REFRESH_TOKEN,
    HttpStatus.UNAUTHORIZED,
    'Invalid refresh token',
  );
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

type Tx = Prisma.TransactionClient;

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Создаёт сессию и возвращает пару токенов. Refresh token хранится только как SHA-256. */
  async createSession(
    membership: { id: string; userId: string },
    meta: ClientMeta,
    tx: Tx = this.prisma,
  ): Promise<{ sessionId: string; tokens: AuthTokens }> {
    const refreshToken = randomBytes(32).toString('base64url');
    const session = await tx.session.create({
      data: {
        userId: membership.userId,
        membershipId: membership.id,
        refreshTokenHash: hashRefreshToken(refreshToken),
        expiresAt: this.refreshExpiry(),
        userAgent: meta.userAgent?.slice(0, 500),
        ip: meta.ip?.slice(0, 64),
      },
    });
    await tx.membership.update({
      where: { id: membership.id },
      data: { lastLoginAt: new Date() },
    });
    return {
      sessionId: session.id,
      tokens: await this.tokensFor(session.id, membership.userId, refreshToken),
    };
  }

  /**
   * Ротация refresh token: старая сессия отзывается, создаётся новая.
   * Повторное использование отозванного токена = признак кражи → отзываем все сессии пользователя.
   */
  async rotate(
    refreshToken: string,
    meta: ClientMeta,
  ): Promise<{ membershipId: string; tokens: AuthTokens }> {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hashRefreshToken(refreshToken) },
      include: { membership: { include: { user: true, company: true } } },
    });
    if (!session) throw invalidRefreshToken();

    if (session.revokedAt) {
      const reusedLate =
        session.replacedById && Date.now() - session.revokedAt.getTime() > ROTATION_GRACE_MS;
      if (reusedLate) {
        this.logger.warn(
          `Refresh token reuse detected for user ${session.userId}; revoking all sessions`,
        );
        await this.revokeAllForUser(session.userId);
      }
      throw invalidRefreshToken();
    }
    if (session.expiresAt <= new Date()) throw invalidRefreshToken();

    const { membership } = session;
    if (!membership.isActive || !membership.user.isActive || !membership.company.isActive) {
      await this.revoke(session.id);
      throw new AppException(
        ErrorCode.ACCOUNT_DISABLED,
        HttpStatus.FORBIDDEN,
        'Account is disabled',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await this.createSession(membership, meta, tx);
      // Условное обновление защищает от параллельной ротации одного и того же токена
      const { count } = await tx.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: created.sessionId },
      });
      if (count === 0) throw invalidRefreshToken();
      return { membershipId: membership.id, tokens: created.tokens };
    });
  }

  /** Загружает контекст запроса из сессии. Вызывается на каждом защищённом запросе. */
  async resolveAuthContext(sessionId: string, userId: string): Promise<AuthContext> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        membership: {
          include: { user: true, company: true, branches: { select: { branchId: true } } },
        },
      },
    });
    if (
      !session ||
      session.userId !== userId ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    ) {
      throw AppException.unauthorized('Session expired');
    }
    const { membership } = session;
    if (!membership.isActive || !membership.user.isActive || !membership.company.isActive) {
      throw new AppException(
        ErrorCode.ACCOUNT_DISABLED,
        HttpStatus.FORBIDDEN,
        'Account is disabled',
      );
    }

    return {
      sessionId: session.id,
      userId: membership.userId,
      membershipId: membership.id,
      companyId: membership.companyId,
      role: membership.role,
      permissions: new Set(resolvePermissions(membership.role, membership.extraPermissions)),
      allBranches: membership.allBranches,
      branchIds: membership.branches.map((b) => b.branchId),
    };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string, tx: Tx = this.prisma): Promise<void> {
    await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForMembership(membershipId: string, tx: Tx = this.prisma): Promise<void> {
    await tx.session.updateMany({
      where: { membershipId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async tokensFor(
    sessionId: string,
    userId: string,
    refreshToken: string,
  ): Promise<AuthTokens> {
    const expiresIn = this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
    const accessToken = await this.jwt.signAsync({ sub: userId, sid: sessionId }, { expiresIn });
    return { accessToken, expiresIn, refreshToken };
  }

  private refreshExpiry(): Date {
    const days = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
}
