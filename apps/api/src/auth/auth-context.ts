import { HttpStatus } from '@nestjs/common';
import { ErrorCode, type Permission, type Role } from '@myshop/shared';
import type { Request } from 'express';
import { AppException } from '../common/errors/app.exception.js';

/**
 * Контекст аутентифицированного запроса. Формируется JwtAuthGuard из сессии в БД
 * (а не из данных клиента) на каждом запросе — изменения ролей и блокировки
 * действуют немедленно.
 */
export interface AuthContext {
  sessionId: string;
  userId: string;
  membershipId: string;
  /** Компания пользователя. ВСЕ запросы к бизнес-данным фильтруются по нему. */
  companyId: string;
  role: Role;
  permissions: ReadonlySet<Permission>;
  /** true — доступ ко всем филиалам компании. */
  allBranches: boolean;
  /** Филиалы с доступом (при allBranches = false). */
  branchIds: readonly string[];
  /** Для журнала аудита. */
  ip?: string;
  userAgent?: string;
}

export type AuthenticatedRequest = Request & { auth?: AuthContext };

export function hasPermission(ctx: AuthContext, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

export function canAccessBranch(ctx: AuthContext, branchId: string): boolean {
  return ctx.allBranches || ctx.branchIds.includes(branchId);
}

/** Бросает BRANCH_ACCESS_DENIED, если у сотрудника нет доступа к филиалу. */
export function assertBranchAccess(ctx: AuthContext, branchId: string): void {
  if (!canAccessBranch(ctx, branchId)) {
    throw new AppException(
      ErrorCode.BRANCH_ACCESS_DENIED,
      HttpStatus.FORBIDDEN,
      'No access to this branch',
    );
  }
}

/**
 * Prisma-условие для выборки филиалов, доступных сотруднику.
 * Всегда включает companyId — изоляция компаний.
 */
export function accessibleBranchWhere(ctx: AuthContext): {
  companyId: string;
  id?: { in: string[] };
} {
  return ctx.allBranches
    ? { companyId: ctx.companyId }
    : { companyId: ctx.companyId, id: { in: [...ctx.branchIds] } };
}
