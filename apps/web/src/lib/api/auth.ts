import type { AuthResponse, MeResponse, Role } from '@myshop/shared';
import { apiRequest } from './client';

export interface DevUser {
  telegramId: string;
  name: string;
  role: Role;
  companyId: string;
  companyName: string;
}

export const authApi = {
  telegram: (initData: string) =>
    apiRequest<AuthResponse>('/auth/telegram', { method: 'POST', body: { initData }, auth: false }),
  /** Регистрация владельца: бренд, email, пароль. Компания ждёт активации. */
  register: (body: { companyName: string; email: string; password: string; initData?: string }) =>
    apiRequest<AuthResponse>('/auth/register', { method: 'POST', body, auth: false }),
  /** Вход владельца по email и паролю. */
  login: (body: { email: string; password: string; initData?: string }) =>
    apiRequest<AuthResponse>('/auth/login', { method: 'POST', body, auth: false }),
  /** Вход сотрудника: название компании + логин + пароль. */
  staffLogin: (body: { companyName: string; login: string; password: string; initData?: string }) =>
    apiRequest<AuthResponse>('/auth/staff-login', { method: 'POST', body, auth: false }),
  devLogin: (telegramId: string, companyId?: string) =>
    apiRequest<AuthResponse>('/auth/dev-login', {
      method: 'POST',
      body: { telegramId, companyId },
      auth: false,
    }),
  devUsers: () => apiRequest<DevUser[]>('/auth/dev/users', { auth: false }),
  me: () => apiRequest<MeResponse>('/auth/me'),
  logout: () => apiRequest<void>('/auth/logout', { method: 'POST' }),
  switchCompany: (companyId: string) =>
    apiRequest<AuthResponse>('/auth/switch-company', { method: 'POST', body: { companyId } }),
};
