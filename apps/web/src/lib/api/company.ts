import type { Role } from '@myshop/shared';
import { apiRequest } from './client';

export interface Company {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  /** Текст внизу печатного чека. */
  receiptFooter: string | null;
}

export interface Branch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
}

export interface StaffMember {
  id: string;
  telegramId: string | null;
  login: string | null;
  hasPassword: boolean;
  firstName: string;
  lastName: string | null;
  username: string | null;
  phone: string | null;
  role: Role;
  allBranches: boolean;
  branches: Array<{ id: string; name: string }>;
  extraPermissions: string[];
  isActive: boolean;
  lastLoginAt: string | null;
}

export interface StaffInput {
  firstName?: string;
  lastName?: string | null;
  phone?: string | null;
  telegramId?: string | null;
  login?: string | null;
  password?: string;
  role?: Role;
  allBranches?: boolean;
  branchIds?: string[];
  extraPermissions?: string[];
  isActive?: boolean;
}

export const companyApi = {
  current: () => apiRequest<Company>('/companies/current'),
  update: (body: Partial<Omit<Company, 'id'>>) =>
    apiRequest<Company>('/companies/current', { method: 'PATCH', body }),
};

export const branchesApi = {
  list: (includeInactive = false) =>
    apiRequest<Branch[]>(`/branches${includeInactive ? '?includeInactive=true' : ''}`),
  create: (body: { name: string; address?: string | null; phone?: string | null }) =>
    apiRequest<Branch>('/branches', { method: 'POST', body }),
  update: (id: string, body: Partial<Omit<Branch, 'id'>>) =>
    apiRequest<Branch>(`/branches/${id}`, { method: 'PATCH', body }),
};

export const usersApi = {
  list: () => apiRequest<StaffMember[]>('/users'),
  get: (id: string) => apiRequest<StaffMember>(`/users/${id}`),
  create: (body: StaffInput) => apiRequest<StaffMember>('/users', { method: 'POST', body }),
  update: (id: string, body: StaffInput) =>
    apiRequest<StaffMember>(`/users/${id}`, { method: 'PATCH', body }),
};
