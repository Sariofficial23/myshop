import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import type { AuthContext, AuthenticatedRequest } from '../auth-context.js';

/** Внедряет AuthContext текущего пользователя в параметр обработчика. */
export const CurrentAuth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth) {
      throw AppException.unauthorized();
    }
    return request.auth;
  },
);
