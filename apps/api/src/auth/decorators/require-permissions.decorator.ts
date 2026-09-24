import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@myshop/shared';

export const PERMISSIONS_KEY = 'auth:permissions';

/** Требует ВСЕ перечисленные права. Проверяется PermissionsGuard на backend. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
