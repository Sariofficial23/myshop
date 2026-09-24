import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@myshop/shared';
import { AppException } from '../../common/errors/app.exception.js';
import type { AuthenticatedRequest } from '../auth-context.js';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator.js';

/** Проверяет права из @RequirePermissions(). Скрытие кнопок на frontend — не защита. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const { auth } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!auth) throw AppException.unauthorized();

    const missing = required.filter((permission) => !auth.permissions.has(permission));
    if (missing.length) {
      throw AppException.forbidden(`Missing permissions: ${missing.join(', ')}`);
    }
    return true;
  }
}
