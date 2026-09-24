import type { Permission } from '@myshop/shared';

/**
 * next-intl трактует "." в ключе как вложенность, поэтому права вида
 * "returns.create" хранятся в сообщениях как "permissions.returns_create".
 */
export function permissionMessageKey(permission: Permission): `permissions.${string}` {
  return `permissions.${permission.replaceAll('.', '_')}`;
}
