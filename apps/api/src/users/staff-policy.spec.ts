import { ErrorCode, resolvePermissions, Role } from '@myshop/shared';
import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../auth/auth-context.js';
import { AppException } from '../common/errors/app.exception.js';
import {
  assertCanAssignBranches,
  assertCanGrantPermissions,
  assertCanManageRole,
  assertHasBranchAccess,
} from './staff-policy.js';

function ctx(role: Role, overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    sessionId: 's',
    userId: 'u',
    membershipId: 'm',
    companyId: 'c',
    role,
    permissions: new Set(resolvePermissions(role)),
    allBranches: true,
    branchIds: [],
    subscription: 'ACTIVE',
    ...overrides,
  };
}

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof AppException ? error.code : 'other';
  }
  return undefined;
}

describe('assertCanManageRole', () => {
  it('owner can manage every role', () => {
    for (const role of [Role.OWNER, Role.MANAGER, Role.SELLER, Role.WAREHOUSE]) {
      expect(code(() => assertCanManageRole(Role.OWNER, role))).toBeUndefined();
    }
  });

  it('manager can manage sellers and warehouse staff only', () => {
    expect(code(() => assertCanManageRole(Role.MANAGER, Role.SELLER))).toBeUndefined();
    expect(code(() => assertCanManageRole(Role.MANAGER, Role.WAREHOUSE))).toBeUndefined();
    expect(code(() => assertCanManageRole(Role.MANAGER, Role.MANAGER))).toBe(
      ErrorCode.ROLE_ASSIGNMENT_FORBIDDEN,
    );
    expect(code(() => assertCanManageRole(Role.MANAGER, Role.OWNER))).toBe(
      ErrorCode.ROLE_ASSIGNMENT_FORBIDDEN,
    );
  });

  it('seller cannot manage anyone', () => {
    expect(code(() => assertCanManageRole(Role.SELLER, Role.SELLER))).toBe(
      ErrorCode.ROLE_ASSIGNMENT_FORBIDDEN,
    );
  });
});

describe('assertCanGrantPermissions', () => {
  it('manager can grant returns to a seller', () => {
    expect(
      assertCanGrantPermissions(ctx(Role.MANAGER), ['returns.create', 'returns.create']),
    ).toEqual(['returns.create']);
  });

  it('rejects non-grantable permissions', () => {
    expect(code(() => assertCanGrantPermissions(ctx(Role.OWNER), ['users.manage']))).toBe(
      ErrorCode.VALIDATION_ERROR,
    );
    expect(code(() => assertCanGrantPermissions(ctx(Role.OWNER), ['anything']))).toBe(
      ErrorCode.VALIDATION_ERROR,
    );
  });

  it('cannot grant a permission the actor lacks', () => {
    const limitedManager = ctx(Role.MANAGER, {
      permissions: new Set(resolvePermissions(Role.SELLER)),
    });
    expect(code(() => assertCanGrantPermissions(limitedManager, ['returns.create']))).toBe(
      ErrorCode.FORBIDDEN,
    );
  });
});

describe('branch assignment', () => {
  const restricted = ctx(Role.MANAGER, { allBranches: false, branchIds: ['b1'] });

  it('restricted actor can assign only own branches', () => {
    expect(code(() => assertCanAssignBranches(restricted, false, ['b1']))).toBeUndefined();
    expect(code(() => assertCanAssignBranches(restricted, false, ['b2']))).toBe(
      ErrorCode.BRANCH_ACCESS_DENIED,
    );
    expect(code(() => assertCanAssignBranches(restricted, true, []))).toBe(
      ErrorCode.BRANCH_ACCESS_DENIED,
    );
  });

  it('actor with all branches can assign any', () => {
    expect(code(() => assertCanAssignBranches(ctx(Role.OWNER), true, []))).toBeUndefined();
  });

  it('restricted employee needs at least one branch', () => {
    expect(code(() => assertHasBranchAccess(false, []))).toBe(ErrorCode.BRANCH_REQUIRED);
    expect(code(() => assertHasBranchAccess(true, []))).toBeUndefined();
    expect(code(() => assertHasBranchAccess(false, ['b1']))).toBeUndefined();
  });
});
