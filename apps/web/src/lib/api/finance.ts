import type {
  CashOperationType,
  DocumentStatus,
  InstallmentStatus,
  PaymentMethod,
  SalePaymentType,
  SerialStatus,
  SerialType,
  WarrantyClaimStatus,
} from '@myshop/shared';
import type { NamedRef } from './catalog';
import { apiRequest } from './client';
import type { Customer, SaleStatus } from './sales';
import type { Supplier } from './stock';

type Person = { id: string; firstName: string; lastName: string | null };
type ByMethod = Record<PaymentMethod, string>;

function qs(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '' && value !== false) params.set(key, String(value));
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

// ── Рассрочки ──

export interface Installment {
  id: string;
  status: InstallmentStatus;
  total: string;
  paidAmount: string;
  reducedAmount: string;
  remaining: string;
  overdueAmount: string;
  monthlyAmount: string;
  months: number;
  firstDueDate: string;
  nextDueDate: string | null;
  nextDueAmount: string | null;
  createdAt: string;
  branch: NamedRef;
  customer: { id: string; name: string; phone: string | null };
  sale: { id: string; number: number; displayNumber: string; date: string; total: string };
  schedule: Array<{ dueDate: string; amount: string; covered: string }>;
  payments: Array<{
    id: string;
    method: PaymentMethod;
    amount: string;
    createdAt: string;
    receivedBy: Person;
  }>;
}

export const installmentsApi = {
  list: (query: { status?: InstallmentStatus; overdue?: boolean; customerId?: string } = {}) =>
    apiRequest<{
      items: Installment[];
      total: number;
      totals: { remaining: string; overdue: string };
    }>(`/installments${qs(query)}`),
  get: (id: string) => apiRequest<Installment>(`/installments/${id}`),
  pay: (id: string, body: { method: PaymentMethod; amount: string; branchId: string }) =>
    apiRequest<Installment>(`/installments/${id}/payments`, { method: 'POST', body }),
};

// ── Касса ──

export interface CashSummary {
  branchId: string;
  date: string;
  balance: string;
  sales: ByMethod;
  installmentPayments: ByMethod;
  refunds: ByMethod;
  deposits: string;
  withdrawals: string;
  expenses: string;
  cashIn: string;
  cashOut: string;
  revenue: string;
}

export interface CashOperation {
  id: string;
  type: CashOperationType;
  amount: string;
  reason: string;
  createdAt: string;
  createdBy: Person;
}

export const cashApi = {
  summary: (branchId: string, date?: string) =>
    apiRequest<CashSummary>(`/cash/summary${qs({ branchId, date })}`),
  operations: (branchId: string, date?: string) =>
    apiRequest<CashOperation[]>(`/cash/operations${qs({ branchId, date })}`),
  create: (body: { branchId: string; type: CashOperationType; amount: string; reason: string }) =>
    apiRequest<CashOperation>('/cash/operations', { method: 'POST', body }),
};

// ── Гарантия ──

export interface WarrantyClaim {
  id: string;
  number: number;
  displayNumber: string;
  status: WarrantyClaimStatus;
  inWarranty: boolean;
  problem: string;
  resolution: string | null;
  createdAt: string;
  closedAt: string | null;
  branch: NamedRef;
  customer: { id: string; name: string; phone: string | null } | null;
  sale: { id: string; displayNumber: string; date: string } | null;
  createdBy: Person;
  serialNumber: {
    id: string;
    number: string;
    warrantyEnd: string | null;
    variant: { name: string | null; product: { name: string } };
  };
}

export interface WarrantyLookup {
  id: string;
  number: string;
  type: SerialType;
  status: SerialStatus;
  sold: boolean;
  inWarranty: boolean;
  warrantyStart: string | null;
  warrantyEnd: string | null;
  variant: { id: string; sku: string; name: string | null; product: { name: string } };
  sale: {
    id: string;
    displayNumber: string;
    date: string;
    branch: NamedRef;
    customer: { id: string; name: string; phone: string | null } | null;
  } | null;
  claims: WarrantyClaim[];
}

export const warrantyApi = {
  lookup: (number: string) => apiRequest<WarrantyLookup>(`/warranty/${encodeURIComponent(number)}`),
  claims: (query: { status?: WarrantyClaimStatus } = {}) =>
    apiRequest<{ items: WarrantyClaim[]; total: number }>(`/warranty-claims${qs(query)}`),
  claim: (id: string) => apiRequest<WarrantyClaim>(`/warranty-claims/${id}`),
  create: (body: { serialNumber: string; branchId: string; problem: string }) =>
    apiRequest<WarrantyClaim>('/warranty-claims', { method: 'POST', body }),
  update: (id: string, body: { status: WarrantyClaimStatus; resolution?: string | null }) =>
    apiRequest<WarrantyClaim>(`/warranty-claims/${id}`, { method: 'PATCH', body }),
};

// ── Карточки клиента и поставщика ──

export interface CustomerCard extends Customer {
  stats: {
    salesCount: number;
    totalSpent: string;
    lastPurchaseAt: string | null;
    debt: string;
    overdue: string;
  };
  sales: Array<{
    id: string;
    displayNumber: string;
    date: string;
    total: string;
    status: SaleStatus;
    paymentType: SalePaymentType;
    branch: NamedRef;
  }>;
  installments: Array<{
    id: string;
    saleDisplayNumber: string;
    remaining: string;
    overdueAmount: string;
    nextDueDate: string | null;
  }>;
}

export interface SupplierCard extends Supplier {
  stats: { purchasesCount: number; totalPurchased: string; lastPurchaseAt: string | null };
  purchases: Array<{
    id: string;
    displayNumber: string;
    date: string;
    status: DocumentStatus;
    total: string;
    documentNumber: string | null;
    branch: NamedRef;
  }>;
}

export const cardsApi = {
  customer: (id: string) => apiRequest<CustomerCard>(`/customers/${id}`),
  supplier: (id: string) => apiRequest<SupplierCard>(`/suppliers/${id}`),
};
