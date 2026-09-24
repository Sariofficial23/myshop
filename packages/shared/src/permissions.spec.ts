import { describe, expect, it } from 'vitest';
import {
  assignableRoles,
  hasAllBranchesByDefault,
  Permission,
  PERMISSIONS,
  resolvePermissions,
  Role,
  ROLE_PERMISSIONS,
} from './index.js';

describe('ROLE_PERMISSIONS', () => {
  it('OWNER has full access', () => {
    expect(ROLE_PERMISSIONS.OWNER).toEqual(PERMISSIONS);
  });

  it('MANAGER manages sales, products, stock, staff, reports, customers and suppliers', () => {
    const manager = ROLE_PERMISSIONS.MANAGER;
    for (const permission of [
      Permission.SALES_CREATE,
      Permission.PRODUCTS_MANAGE,
      Permission.PURCHASES_MANAGE,
      Permission.USERS_MANAGE,
      Permission.REPORTS_VIEW,
      Permission.CUSTOMERS_MANAGE,
      Permission.SUPPLIERS_MANAGE,
    ]) {
      expect(manager).toContain(permission);
    }
    expect(manager).not.toContain(Permission.COMPANY_MANAGE);
    expect(manager).not.toContain(Permission.BRANCHES_MANAGE);
  });

  it('SELLER sells and views products but cannot return without a grant', () => {
    const seller = ROLE_PERMISSIONS.SELLER;
    expect(seller).toContain(Permission.SALES_CREATE);
    expect(seller).toContain(Permission.CUSTOMERS_MANAGE);
    expect(seller).toContain(Permission.PRODUCTS_VIEW);
    expect(seller).not.toContain(Permission.PRODUCTS_MANAGE);
    expect(seller).not.toContain(Permission.RETURNS_CREATE);
    expect(seller).not.toContain(Permission.PURCHASES_MANAGE);
    expect(seller).not.toContain(Permission.USERS_MANAGE);
  });

  it('WAREHOUSE handles purchases, stock, transfers, inventory and write-offs but not sales', () => {
    const warehouse = ROLE_PERMISSIONS.WAREHOUSE;
    for (const permission of [
      Permission.PURCHASES_MANAGE,
      Permission.STOCK_VIEW,
      Permission.TRANSFERS_MANAGE,
      Permission.INVENTORY_MANAGE,
      Permission.WRITE_OFFS_MANAGE,
    ]) {
      expect(warehouse).toContain(permission);
    }
    expect(warehouse).not.toContain(Permission.SALES_CREATE);
    expect(warehouse).not.toContain(Permission.USERS_MANAGE);
  });
});

describe('resolvePermissions', () => {
  it('adds grantable extra permissions (seller + returns)', () => {
    expect(resolvePermissions(Role.SELLER, ['returns.create'])).toContain(
      Permission.RETURNS_CREATE,
    );
  });

  it('ignores unknown and non-grantable permissions', () => {
    const result = resolvePermissions(Role.SELLER, ['users.manage', 'company.manage', 'hack']);
    expect(result).not.toContain(Permission.USERS_MANAGE);
    expect(result).not.toContain(Permission.COMPANY_MANAGE);
    expect(result).toEqual(resolvePermissions(Role.SELLER));
  });
});

describe('assignableRoles', () => {
  it('only OWNER can assign OWNER and MANAGER', () => {
    expect(assignableRoles(Role.OWNER)).toEqual(['OWNER', 'MANAGER', 'SELLER', 'WAREHOUSE']);
    expect(assignableRoles(Role.MANAGER)).toEqual(['SELLER', 'WAREHOUSE']);
    expect(assignableRoles(Role.SELLER)).toEqual([]);
    expect(assignableRoles(Role.WAREHOUSE)).toEqual([]);
  });
});

describe('hasAllBranchesByDefault', () => {
  it('owner and manager see all branches, others are restricted', () => {
    expect(hasAllBranchesByDefault(Role.OWNER)).toBe(true);
    expect(hasAllBranchesByDefault(Role.MANAGER)).toBe(true);
    expect(hasAllBranchesByDefault(Role.SELLER)).toBe(false);
    expect(hasAllBranchesByDefault(Role.WAREHOUSE)).toBe(false);
  });
});
