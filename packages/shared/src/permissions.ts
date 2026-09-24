import { Role } from './roles.js';

/**
 * Права доступа. Backend проверяет их на каждом запросе (PermissionsGuard),
 * frontend использует только для скрытия недоступных кнопок.
 */
export const Permission = {
  COMPANY_MANAGE: 'company.manage',
  BRANCHES_VIEW: 'branches.view',
  BRANCHES_MANAGE: 'branches.manage',
  USERS_VIEW: 'users.view',
  USERS_MANAGE: 'users.manage',
  PRODUCTS_VIEW: 'products.view',
  PRODUCTS_MANAGE: 'products.manage',
  STOCK_VIEW: 'stock.view',
  PURCHASES_MANAGE: 'purchases.manage',
  TRANSFERS_MANAGE: 'transfers.manage',
  INVENTORY_MANAGE: 'inventory.manage',
  WRITE_OFFS_MANAGE: 'write_offs.manage',
  SALES_CREATE: 'sales.create',
  SALES_VIEW: 'sales.view',
  RETURNS_CREATE: 'returns.create',
  CUSTOMERS_MANAGE: 'customers.manage',
  SUPPLIERS_MANAGE: 'suppliers.manage',
  CASH_MANAGE: 'cash.manage',
  REPORTS_VIEW: 'reports.view',
  AUDIT_VIEW: 'audit.view',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const PERMISSIONS: readonly Permission[] = Object.values(Permission);

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value);
}

const P = Permission;

/** Базовые права ролей (из ТЗ, раздел 4). */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  // Полный доступ
  [Role.OWNER]: PERMISSIONS,
  // Продажи, товары, склад, сотрудники, отчёты, клиенты, поставщики
  [Role.MANAGER]: [
    P.BRANCHES_VIEW,
    P.USERS_VIEW,
    P.USERS_MANAGE,
    P.PRODUCTS_VIEW,
    P.PRODUCTS_MANAGE,
    P.STOCK_VIEW,
    P.PURCHASES_MANAGE,
    P.TRANSFERS_MANAGE,
    P.INVENTORY_MANAGE,
    P.WRITE_OFFS_MANAGE,
    P.SALES_CREATE,
    P.SALES_VIEW,
    P.RETURNS_CREATE,
    P.CUSTOMERS_MANAGE,
    P.SUPPLIERS_MANAGE,
    P.CASH_MANAGE,
    P.REPORTS_VIEW,
  ],
  // Продажи, клиенты, просмотр товаров. Возвраты — только через дополнительное право.
  [Role.SELLER]: [
    P.BRANCHES_VIEW,
    P.PRODUCTS_VIEW,
    P.STOCK_VIEW,
    P.SALES_CREATE,
    P.SALES_VIEW,
    P.CUSTOMERS_MANAGE,
  ],
  // Приход, склад, перемещение, инвентаризация, списание
  [Role.WAREHOUSE]: [
    P.BRANCHES_VIEW,
    P.PRODUCTS_VIEW,
    P.STOCK_VIEW,
    P.PURCHASES_MANAGE,
    P.TRANSFERS_MANAGE,
    P.INVENTORY_MANAGE,
    P.WRITE_OFFS_MANAGE,
    P.SUPPLIERS_MANAGE,
  ],
};

/**
 * Дополнительные права, которые можно выдать сотруднику сверх роли.
 * Например, продавцу — право оформлять возвраты.
 */
export const GRANTABLE_PERMISSIONS: readonly Permission[] = [
  P.RETURNS_CREATE,
  P.PRODUCTS_MANAGE,
  P.REPORTS_VIEW,
  P.CASH_MANAGE,
];

/** Итоговые права сотрудника: права роли + выданные дополнительно. */
export function resolvePermissions(
  role: Role,
  extraPermissions: readonly string[] = [],
): Permission[] {
  const result = new Set<Permission>(ROLE_PERMISSIONS[role]);
  for (const permission of extraPermissions) {
    if (isPermission(permission) && GRANTABLE_PERMISSIONS.includes(permission)) {
      result.add(permission);
    }
  }
  return PERMISSIONS.filter((permission) => result.has(permission));
}

/** Роли, которые может назначать пользователь с данной ролью. */
export function assignableRoles(actorRole: Role): Role[] {
  switch (actorRole) {
    case Role.OWNER:
      return [Role.OWNER, Role.MANAGER, Role.SELLER, Role.WAREHOUSE];
    case Role.MANAGER:
      return [Role.SELLER, Role.WAREHOUSE];
    default:
      return [];
  }
}

/** По умолчанию владелец и менеджер видят все филиалы компании. */
export function hasAllBranchesByDefault(role: Role): boolean {
  return role === Role.OWNER || role === Role.MANAGER;
}
