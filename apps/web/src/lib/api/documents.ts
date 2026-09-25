import type { DocumentStatus, PaymentMethod, SerialType, WriteOffReason } from '@myshop/shared';
import type { NamedRef } from './catalog';
import { apiRequest } from './client';

type Person = { id: string; firstName: string; lastName: string | null };
type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

export interface DocVariant {
  id: string;
  sku: string;
  name: string | null;
  product: { id: string; name: string; serialType: SerialType | null };
}

/** Строка складского документа для API: количество или IMEI. */
export interface StockLineInput {
  variantId: string;
  quantity?: number;
  serialNumbers?: string[];
}

export interface StockDocItem {
  id: string;
  variantId: string;
  quantity: number;
  unitCost: string;
  serialNumbers: string[];
  variant: DocVariant;
}

export interface Transfer {
  id: string;
  number: number;
  displayNumber: string;
  date: string;
  notes: string | null;
  fromBranch: NamedRef;
  toBranch: NamedRef;
  createdBy: Person;
  items: StockDocItem[];
}

export interface WriteOff {
  id: string;
  number: number;
  displayNumber: string;
  date: string;
  reason: WriteOffReason;
  notes: string | null;
  costTotal: string;
  branch: NamedRef;
  createdBy: Person;
  items: StockDocItem[];
}

export interface InventoryItem {
  id: string;
  variantId: string;
  countedQuantity: number;
  expectedQuantity: number;
  difference: number;
  serialNumbers: string[];
  missingSerials: string[];
  variant: DocVariant;
}

export interface Inventory {
  id: string;
  number: number;
  displayNumber: string;
  status: DocumentStatus;
  notes: string | null;
  createdAt: string;
  confirmedAt: string | null;
  branch: NamedRef;
  createdBy: Person;
  confirmedBy: Person | null;
  items: InventoryItem[];
}

export interface InventorySummary extends Omit<Inventory, 'items'> {
  itemsCount: number;
}

export interface SaleReturn {
  id: string;
  number: number;
  displayNumber: string;
  date: string;
  reason: string | null;
  refundTotal: string;
  costTotal?: string;
  branch: NamedRef;
  sale: { id: string; number: number; displayNumber: string; customer: NamedRef | null };
  createdBy: Person;
  refunds: Array<{ id: string; method: PaymentMethod; amount: string }>;
  items: Array<{
    id: string;
    saleItemId: string;
    quantity: number;
    amount: string;
    serialNumbers: string[];
    variant: DocVariant;
  }>;
}

export interface ReturnInput {
  saleId: string;
  refundMethod: PaymentMethod;
  reason?: string | null;
  items: Array<{ saleItemId: string; quantity?: number; serialNumbers?: string[] }>;
}

function qs(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

export const returnsApi = {
  list: (query: { saleId?: string; branchId?: string; page?: number } = {}) =>
    apiRequest<Page<SaleReturn>>(`/returns${qs(query)}`),
  get: (id: string) => apiRequest<SaleReturn>(`/returns/${id}`),
  create: (body: ReturnInput) => apiRequest<SaleReturn>('/returns', { method: 'POST', body }),
};

export const transfersApi = {
  list: (query: { branchId?: string; page?: number } = {}) =>
    apiRequest<Page<Transfer>>(`/transfers${qs(query)}`),
  get: (id: string) => apiRequest<Transfer>(`/transfers/${id}`),
  create: (body: {
    fromBranchId: string;
    toBranchId: string;
    notes?: string | null;
    items: StockLineInput[];
  }) => apiRequest<Transfer>('/transfers', { method: 'POST', body }),
  targets: () => apiRequest<NamedRef[]>('/branches/transfer-targets'),
};

export const writeOffsApi = {
  list: (query: { branchId?: string; page?: number } = {}) =>
    apiRequest<Page<WriteOff>>(`/write-offs${qs(query)}`),
  get: (id: string) => apiRequest<WriteOff>(`/write-offs/${id}`),
  create: (body: {
    branchId: string;
    reason: WriteOffReason;
    notes?: string | null;
    items: StockLineInput[];
  }) => apiRequest<WriteOff>('/write-offs', { method: 'POST', body }),
};

export const inventoriesApi = {
  list: (query: { branchId?: string; status?: DocumentStatus; page?: number } = {}) =>
    apiRequest<Page<InventorySummary>>(`/inventories${qs(query)}`),
  get: (id: string) => apiRequest<Inventory>(`/inventories/${id}`),
  create: (body: {
    branchId: string;
    notes?: string | null;
    confirm?: boolean;
    items: StockLineInput[];
  }) => apiRequest<Inventory>('/inventories', { method: 'POST', body }),
  update: (id: string, body: { notes?: string | null; items: StockLineInput[] }) =>
    apiRequest<Inventory>(`/inventories/${id}`, { method: 'PUT', body }),
  confirm: (id: string) => apiRequest<Inventory>(`/inventories/${id}/confirm`, { method: 'POST' }),
  cancel: (id: string) => apiRequest<Inventory>(`/inventories/${id}/cancel`, { method: 'POST' }),
};
