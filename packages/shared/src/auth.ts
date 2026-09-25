import type { Locale } from './locales.js';
import type { Permission } from './permissions.js';
import type { Role } from './roles.js';
import type { SubscriptionState } from './subscription.js';

export interface AuthUser {
  id: string;
  telegramId: string | null;
  email: string | null;
  firstName: string;
  lastName: string | null;
  username: string | null;
  languageCode: Locale | null;
}

export interface AuthCompany {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  /** Подписка: ACTIVE — работа, EXPIRED — только просмотр, PENDING / BLOCKED — доступа нет. */
  subscription: { state: SubscriptionState; paidUntil: string | null };
}

export interface AuthBranch {
  id: string;
  name: string;
}

export interface AuthMembershipSummary {
  companyId: string;
  companyName: string;
  role: Role;
}

/** Текущий контекст пользователя: кто он, в какой компании, что ему можно. */
export interface MeResponse {
  user: AuthUser;
  company: AuthCompany;
  role: Role;
  permissions: Permission[];
  /** Филиалы, к которым у пользователя есть доступ. */
  branches: AuthBranch[];
  /** true — доступ ко всем филиалам компании (включая будущие). */
  allBranches: boolean;
  /** Все компании пользователя (для переключения). */
  memberships: AuthMembershipSummary[];
}

export interface AuthTokens {
  accessToken: string;
  /** Время жизни access token в секундах. */
  expiresIn: number;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  me: MeResponse;
}
