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
  register: (body: { initData: string; companyName: string; branchName?: string }) =>
    apiRequest<AuthResponse>('/auth/telegram/register', { method: 'POST', body, auth: false }),
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
