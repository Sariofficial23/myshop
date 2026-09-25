import { ErrorCode, Permission, resolvePermissions, Role } from '@myshop/shared';
import { describe, expect, it } from 'vitest';
import { AppException } from '../common/errors/app.exception.js';
import {
  accessibleBranchWhere,
  assertBranchAccess,
  type AuthContext,
  canAccessBranch,
  hasPermission,
} from './auth-context.js';

function ctx(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    sessionId: 's',
    userId: 'u',
    membershipId: 'm',
    companyId: 'company-a',
    role: Role.SELLER,
    permissions: new Set(resolvePermissions(Role.SELLER)),
    allBranches: false,
    branchIds: ['branch-1'],
    subscription: 'ACTIVE',
    ...overrides,
  };
}

describe('branch access', () => {
  it('restricted employee can access only assigned branches', () => {
    expect(canAccessBranch(ctx(), 'branch-1')).toBe(true);
    expect(canAccessBranch(ctx(), 'branch-2')).toBe(false);
  });

  it('allBranches grants access to any branch of the company', () => {
    expect(canAccessBranch(ctx({ allBranches: true, branchIds: [] }), 'branch-2')).toBe(true);
  });

  it('assertBranchAccess throws BRANCH_ACCESS_DENIED', () => {
    let caught: unknown;
    try {
      assertBranchAccess(ctx(), 'branch-2');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppException);
    expect((caught as AppException).code).toBe(ErrorCode.BRANCH_ACCESS_DENIED);
    expect((caught as AppException).getStatus()).toBe(403);
    expect(() => assertBranchAccess(ctx(), 'branch-1')).not.toThrow();
  });
});

describe('company isolation in queries', () => {
  it('always scopes branch queries by companyId', () => {
    expect(accessibleBranchWhere(ctx())).toEqual({
      companyId: 'company-a',
      id: { in: ['branch-1'] },
    });
    expect(accessibleBranchWhere(ctx({ allBranches: true }))).toEqual({ companyId: 'company-a' });
  });
});

describe('hasPermission', () => {
  it('reflects the resolved permission set', () => {
    expect(hasPermission(ctx(), Permission.SALES_CREATE)).toBe(true);
    expect(hasPermission(ctx(), Permission.USERS_MANAGE)).toBe(false);
  });
});
