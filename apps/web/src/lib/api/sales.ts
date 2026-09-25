import type { PaymentMethod, SalePaymentType, SerialType } from '@myshop/shared';
import type { NamedRef } from './catalog';
import { apiRequest } from './client';

export type SaleStatus = 'COMPLETED' | 'PARTIALLY_RETURNED' | 'RETURNED';

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  telegramId: string | null;
  notes: string | null;
  isActive: boolean;
  /** Остаток долга по рассрочкам (в списке клиентов). */
  debt?: string;
}

export interface CustomerInput {
  name: string;
  phone?: string | null;
  notes?: string | null;
}

export interface SalePayment {
  id: string;
  method: PaymentMethod;
  amount: string;
  createdAt: string;
}

export interface SaleItem {
  id: string;
  variantId: string;
  quantity: number;
  price: string;
  discount: string;
  total: string;
  returnedQuantity: number;
  refundedAmount: string;
  /** Только при праве reports.view. */
  unitCost?: string;
  variant: {
    id: string;
    sku: string;
    name: string | null;
    product: { id: string; name: string; serialType: SerialType | null; warrantyMonths: number };
  };
  serialNumbers: Array<{
    id: string;
    number: string;
    type: SerialType;
    /** SOLD — продан этим чеком, IN_STOCK — возвращён. */
    status: string;
    warrantyEnd: string | null;
  }>;
}

export interface Sale {
  id: string;
  number: number;
  displayNumber: string;
  date: string;
  status: SaleStatus;
  paymentType: SalePaymentType;
  subtotal: string;
  discountTotal: string;
  total: string;
  paidTotal: string;
  /** Сколько возвращено клиенту по возвратам. */
  refundedTotal: string;
  /** Только при праве reports.view. */
  costTotal?: string;
  grossProfit?: string;
  notes: string | null;
  branch: NamedRef;
  customer: { id: string; name: string; phone: string | null } | null;
  seller: { id: string; firstName: string; lastName: string | null };
  payments: SalePayment[];
  installment: {
    id: string;
    total: string;
    paidAmount: string;
    remaining: string;
    months: number;
    status: 'ACTIVE' | 'PAID';
  } | null;
  returns: Array<{
    id: string;
    number: number;
    displayNumber: string;
    date: string;
    refundTotal: string;
  }>;
  items: SaleItem[];
}

export interface SaleInput {
  branchId: string;
  customerId?: string | null;
  notes?: string | null;
  items: Array<{
    variantId: string;
    quantity?: number;
    price?: string | null;
    discount?: string | null;
    serialNumbers?: string[];
  }>;
  payments: Array<{ method: PaymentMethod; amount: string }>;
  installment?: { months: number; firstDueDate?: string };
}

export interface SerialInStock {
  id: string;
  number: string;
  type: SerialType;
  branch: NamedRef;
}

function qs(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

export const salesApi = {
  list: (query: { branchId?: string; from?: string; to?: string; page?: number } = {}) =>
    apiRequest<{ items: Sale[]; total: number; page: number; pageSize: number }>(
      `/sales${qs(query)}`,
    ),
  get: (id: string) => apiRequest<Sale>(`/sales/${id}`),
  create: (body: SaleInput) => apiRequest<Sale>('/sales', { method: 'POST', body }),
};

export const customersApi = {
  list: (q?: string) => apiRequest<Customer[]>(`/customers${qs({ q })}`),
  create: (body: CustomerInput) => apiRequest<Customer>('/customers', { method: 'POST', body }),
  update: (id: string, body: Partial<CustomerInput> & { name: string; isActive?: boolean }) =>
    apiRequest<Customer>(`/customers/${id}`, { method: 'PATCH', body }),
};

export const serialsApi = {
  inStock: (variantId: string, branchId: string) =>
    apiRequest<SerialInStock[]>(`/serial-numbers${qs({ variantId, branchId })}`),
};
