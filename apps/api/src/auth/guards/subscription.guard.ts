import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@myshop/shared';
import { AppException } from '../../common/errors/app.exception.js';
import type { AuthenticatedRequest } from '../auth-context.js';
import { ALLOW_WITHOUT_SUBSCRIPTION_KEY } from '../decorators/allow-without-subscription.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Подписка компании (SaaS):
 *  - PENDING / BLOCKED — работать нельзя (кроме профиля и выхода);
 *  - EXPIRED — только просмотр: любые изменения запрещены до продления;
 *  - ACTIVE — без ограничений.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_WITHOUT_SUBSCRIPTION_KEY, targets)) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const state = request.auth?.subscription;
    if (state === 'PENDING') {
      throw new AppException(
        ErrorCode.COMPANY_PENDING,
        HttpStatus.FORBIDDEN,
        'Company is waiting for activation',
      );
    }
    if (state === 'BLOCKED') {
      throw new AppException(ErrorCode.COMPANY_BLOCKED, HttpStatus.FORBIDDEN, 'Company is blocked');
    }
    if (state === 'EXPIRED' && !READ_METHODS.has(request.method)) {
      throw new AppException(
        ErrorCode.SUBSCRIPTION_EXPIRED,
        HttpStatus.PAYMENT_REQUIRED,
        'Subscription expired: read-only access',
      );
    }
    return true;
  }
}
