import type { PaymentMethod } from '@myshop/shared';
import { apiRequest } from './client';

export interface SalesReport {
  from: string;
  to: string;
  salesCount: number;
  itemsSold: number;
  revenue: string;
  discount: string;
  returnsCount: number;
  returns: string;
  netRevenue: string;
  averageCheck: string;
  /** Только при праве reports.view. */
  grossProfit?: string;
  money: Record<PaymentMethod, string>;
  items: Array<{
    variantId: string;
    product: string;
    variant: string | null;
    sku: string;
    quantity: number;
    amount: string;
    profit?: string;
  }>;
  sellers: Array<{ id: string; name: string; salesCount: number; revenue: string }>;
}

export const reportsApi = {
  sales: (query: { branchId?: string; from?: string; to?: string } = {}) => {
    const params = new URLSearchParams(
      Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])),
    ).toString();
    return apiRequest<SalesReport>(`/reports/sales${params ? `?${params}` : ''}`);
  },
};
