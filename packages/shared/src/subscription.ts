/** Статус компании на платформе. */
export const CompanyStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  BLOCKED: 'BLOCKED',
} as const;

export type CompanyStatus = (typeof CompanyStatus)[keyof typeof CompanyStatus];

/**
 * Что компании можно прямо сейчас:
 * ACTIVE — всё; EXPIRED — подписка закончилась, только просмотр;
 * PENDING — ждёт активации; BLOCKED — заблокирована администратором.
 */
export type SubscriptionState = 'ACTIVE' | 'EXPIRED' | 'PENDING' | 'BLOCKED';

export function subscriptionState(
  status: CompanyStatus,
  paidUntil: Date | string | null,
  now: Date = new Date(),
): SubscriptionState {
  if (status !== 'ACTIVE') return status;
  if (paidUntil !== null && new Date(paidUntil).getTime() < now.getTime()) return 'EXPIRED';
  return 'ACTIVE';
}

/** Ключ названия компании: регистр и лишние пробелы не важны ("Apple  Store" = "apple store"). */
export function companyNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Логин сотрудника и email владельца сравниваются без учёта регистра. */
export function normalizeLogin(login: string): string {
  return login.trim().toLowerCase();
}

export const PASSWORD_MIN_LENGTH = 6;
