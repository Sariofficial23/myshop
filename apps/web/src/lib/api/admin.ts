import type { CompanyStatus, SubscriptionState } from '@myshop/shared';
import { getTelegramInitData } from '../telegram/web-app';
import { apiRequest } from './client';

export interface PlatformCompany {
  id: string;
  name: string;
  status: CompanyStatus;
  state: SubscriptionState;
  paidUntil: string | null;
  createdAt: string;
  owner: {
    name: string;
    email: string | null;
    username: string | null;
    telegramId: string | null;
  } | null;
  usersCount: number;
  branchesCount: number;
  salesCount: number;
}

/** Админ-панель платформы: доступ по подписанному Telegram initData администратора. */
function adminRequest<T>(path: string, init: { method?: string; body?: unknown } = {}) {
  return apiRequest<T>(`/admin${path}`, {
    ...init,
    auth: false,
    headers: { 'x-telegram-init-data': getTelegramInitData() },
  });
}

export const adminApi = {
  me: () => adminRequest<{ telegramId: string; firstName: string }>('/me'),
  companies: () => adminRequest<PlatformCompany[]>('/companies'),
  extend: (id: string, months: number) =>
    adminRequest<PlatformCompany>(`/companies/${id}/extend`, { method: 'POST', body: { months } }),
  block: (id: string) =>
    adminRequest<PlatformCompany>(`/companies/${id}/block`, { method: 'POST' }),
  unblock: (id: string) =>
    adminRequest<PlatformCompany>(`/companies/${id}/unblock`, { method: 'POST' }),
};
