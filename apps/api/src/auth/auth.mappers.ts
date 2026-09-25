import { type AuthUser, isLocale } from '@myshop/shared';
import type { User } from '@myshop/database';

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    telegramId: user.telegramId?.toString() ?? null,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    languageCode: isLocale(user.languageCode) ? user.languageCode : null,
  };
}
