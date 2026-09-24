import { HttpStatus } from '@nestjs/common';
import {
  assignableRoles,
  ErrorCode,
  GRANTABLE_PERMISSIONS,
  isPermission,
  type Permission,
  type Role,
} from '@myshop/shared';
import type { AuthContext } from '../auth/auth-context.js';
import { AppException } from '../common/errors/app.exception.js';

/**
 * Правила управления сотрудниками. Чистые функции — покрыты unit-тестами.
 *
 *  - OWNER назначает любые роли; MANAGER — только SELLER и WAREHOUSE;
 *  - менеджер не может изменять владельцев и других менеджеров;
 *  - выдать можно только "дополнительные" права, которые есть у самого выдающего;
 *  - сотрудник с ограниченным доступом не может выдать доступ к чужим филиалам.
 */
export function assertCanManageRole(actorRole: Role, targetRole: Role): void {
  if (!assignableRoles(actorRole).includes(targetRole)) {
    throw new AppException(
      ErrorCode.ROLE_ASSIGNMENT_FORBIDDEN,
      HttpStatus.FORBIDDEN,
      `Role ${actorRole} cannot manage role ${targetRole}`,
    );
  }
}

export function assertCanGrantPermissions(
  ctx: AuthContext,
  extra: readonly string[],
): Permission[] {
  const result: Permission[] = [];
  for (const permission of new Set(extra)) {
    if (!isPermission(permission) || !GRANTABLE_PERMISSIONS.includes(permission)) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        `Permission ${permission} cannot be granted`,
      );
    }
    if (!ctx.permissions.has(permission)) {
      throw AppException.forbidden(`Cannot grant permission you do not have: ${permission}`);
    }
    result.push(permission);
  }
  return result;
}

export function assertCanAssignBranches(
  ctx: AuthContext,
  allBranches: boolean,
  branchIds: readonly string[],
): void {
  if (ctx.allBranches) return;
  if (allBranches || branchIds.some((id) => !ctx.branchIds.includes(id))) {
    throw new AppException(
      ErrorCode.BRANCH_ACCESS_DENIED,
      HttpStatus.FORBIDDEN,
      'Cannot grant access to branches you do not have',
    );
  }
}

/** Продавец и склад должны быть привязаны хотя бы к одному филиалу. */
export function assertHasBranchAccess(allBranches: boolean, branchIds: readonly string[]): void {
  if (!allBranches && branchIds.length === 0) {
    throw new AppException(
      ErrorCode.BRANCH_REQUIRED,
      HttpStatus.BAD_REQUEST,
      'Employee must have access to at least one branch',
    );
  }
}
