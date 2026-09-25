import type { DocumentStatus, SerialType, StockMovementType } from '@myshop/shared';
import type { NamedRef } from './catalog';
import { apiRequest } from './client';

export interface StockRow {
  branch: NamedRef;
  variant: { id: string; sku: string; name: string | null; salePrice: string | null };
  product: { id: string; name: string; minimumStock: number; serialType: SerialType | null };
  quantity: number;
  avgCost: string;
  stockValue: string;
  low: boolean;
}

export interface StockMovement {
  id: string;
  type: StockMovementType;
  quantity: number;
  balanceAfter: number;
  unitCost: string | null;
  createdAt: string;
  branch: NamedRef;
  createdBy: { id: string; firstName: string; lastName: string | null };
  purchase: DocRef | null;
  sale: DocRef | null;
  return: DocRef | null;
  transfer: DocRef | null;
  writeOff: DocRef | null;
  inventory: DocRef | null;
}

export interface DocRef {
  id: string;
  number: number;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  contact: string | null;
  notes: string | null;
  isActive: boolean;
}

export interface PurchaseItem {
  id: string;
  variantId: string;
  quantity: number;
  purchasePrice: string;
  salePrice: string | null;
  total: string;
  serialNumbers: string[];
  variant: {
    id: string;
    sku: string;
    name: string | null;
    product: { id: string; name: string; serialType: SerialType | null };
  };
}

export interface Purchase {
  id: string;
  number: number;
  displayNumber: string;
  documentNumber: string | null;
  date: string;
  status: DocumentStatus;
  total: string;
  notes: string | null;
  branch: NamedRef;
  supplier: NamedRef | null;
  createdBy: { id: string; firstName: string; lastName: string | null };
  confirmedBy: { id: string; firstName: string; lastName: string | null } | null;
  confirmedAt: string | null;
  items: PurchaseItem[];
}

export interface PurchaseItemInput {
  variantId: string;
  quantity: number;
  purchasePrice: string;
  salePrice?: string | null;
  serialNumbers?: string[];
}

export interface PurchaseInput {
  branchId: string;
  supplierId?: string | null;
  documentNumber?: string | null;
  notes?: string | null;
  items: PurchaseItemInput[];
  confirm?: boolean;
}

function qs(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '' && value !== false) params.set(key, String(value));
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

export const stockApi = {
  balances: (query: { branchId?: string; q?: string; lowOnly?: boolean } = {}) =>
    apiRequest<StockRow[]>(`/stock${qs(query)}`),
  movements: (query: { variantId?: string; branchId?: string; purchaseId?: string }) =>
    apiRequest<StockMovement[]>(`/stock/movements${qs(query)}`),
};

export const suppliersApi = {
  list: () => apiRequest<Supplier[]>('/suppliers'),
  create: (body: {
    name: string;
    phone?: string | null;
    contact?: string | null;
    notes?: string | null;
  }) => apiRequest<Supplier>('/suppliers', { method: 'POST', body }),
  update: (id: string, body: Partial<Omit<Supplier, 'id'>>) =>
    apiRequest<Supplier>(`/suppliers/${id}`, { method: 'PATCH', body }),
};

export const purchasesApi = {
  list: (query: { status?: DocumentStatus; branchId?: string; page?: number } = {}) =>
    apiRequest<{ items: Purchase[]; total: number; page: number; pageSize: number }>(
      `/purchases${qs(query)}`,
    ),
  get: (id: string) => apiRequest<Purchase>(`/purchases/${id}`),
  create: (body: PurchaseInput) => apiRequest<Purchase>('/purchases', { method: 'POST', body }),
  confirm: (id: string) => apiRequest<Purchase>(`/purchases/${id}/confirm`, { method: 'POST' }),
  cancel: (id: string) => apiRequest<Purchase>(`/purchases/${id}/cancel`, { method: 'POST' }),
};
