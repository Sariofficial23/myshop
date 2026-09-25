import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../../common/errors/app.exception.js';
import type { AuthenticatedRequest } from '../auth-context.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { SessionService } from '../session.service.js';

interface AccessTokenPayload {
  sub: string;
  sid: string;
}

/**
 * Глобальный guard: каждый эндпоинт требует Bearer access token, кроме @Public().
 * Токен лишь указывает на сессию — роль, права и филиалы читаются из БД.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) throw AppException.unauthorized();

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw AppException.unauthorized('Invalid or expired access token');
    }
    if (typeof payload.sid !== 'string' || typeof payload.sub !== 'string') {
      throw AppException.unauthorized('Invalid access token');
    }

    request.auth = {
      ...(await this.sessions.resolveAuthContext(payload.sid, payload.sub)),
      ip: request.ip,
      userAgent: request.headers['user-agent']?.slice(0, 500),
    };
    return true;
  }
}

export function extractBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}
