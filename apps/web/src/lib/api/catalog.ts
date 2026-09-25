import type { ProductUnit, SerialStatus, SerialType } from '@myshop/shared';
import { apiRequest } from './client';

export interface NamedRef {
  id: string;
  name: string;
}

export interface Category extends NamedRef {
  parentId: string | null;
  isActive: boolean;
  productsCount: number;
}

export interface Brand extends NamedRef {
  isActive: boolean;
  productsCount: number;
}

export interface Variant {
  id: string;
  sku: string;
  name: string | null;
  model: string | null;
  color: string | null;
  memory: string | null;
  storage: string | null;
  attributes: Record<string, string>;
  /** Деньги приходят строкой ("11990000.00"), чтобы не терять точность. */
  salePrice: string | null;
  isActive: boolean;
  barcodes: Array<{ id: string; code: string }>;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  unit: ProductUnit;
  minimumStock: number;
  serialType: SerialType | null;
  warrantyMonths: number;
  isActive: boolean;
  category: NamedRef | null;
  brand: NamedRef | null;
  variants: Variant[];
}

export interface ProductPage {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
}

export interface VariantInput {
  sku?: string;
  name?: string | null;
  model?: string | null;
  color?: string | null;
  memory?: string | null;
  storage?: string | null;
  salePrice?: string | null;
  barcodes?: string[];
  isActive?: boolean;
}

export interface ProductInput {
  name?: string;
  sku?: string;
  categoryId?: string | null;
  brandId?: string | null;
  description?: string | null;
  unit?: ProductUnit;
  minimumStock?: number;
  serialType?: SerialType | null;
  warrantyMonths?: number;
  isActive?: boolean;
  variants?: VariantInput[];
}

export interface SerialCheck {
  number: string;
  type: SerialType;
  valid: boolean;
  exists: boolean;
  status: SerialStatus | null;
}

export interface SerialUnit {
  id: string;
  number: string;
  type: SerialType;
  status: SerialStatus;
  branch: NamedRef;
  variant: { id: string; sku: string; name: string | null; product: NamedRef };
}

export interface ProductQuery {
  q?: string;
  categoryId?: string;
  brandId?: string;
  includeInactive?: boolean;
  page?: number;
}

function toQueryString(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '' && value !== false) params.set(key, String(value));
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

export const catalogApi = {
  categories: (includeInactive = false) =>
    apiRequest<Category[]>(`/categories${toQueryString({ includeInactive })}`),
  createCategory: (body: { name: string; parentId?: string | null }) =>
    apiRequest<Category>('/categories', { method: 'POST', body }),
  updateCategory: (
    id: string,
    body: { name?: string; parentId?: string | null; isActive?: boolean },
  ) => apiRequest<Category>(`/categories/${id}`, { method: 'PATCH', body }),

  brands: (includeInactive = false) =>
    apiRequest<Brand[]>(`/brands${toQueryString({ includeInactive })}`),
  createBrand: (body: { name: string }) => apiRequest<Brand>('/brands', { method: 'POST', body }),
  updateBrand: (id: string, body: { name?: string; isActive?: boolean }) =>
    apiRequest<Brand>(`/brands/${id}`, { method: 'PATCH', body }),

  products: (query: ProductQuery = {}) =>
    apiRequest<ProductPage>(`/products${toQueryString(query)}`),
  product: (id: string) => apiRequest<Product>(`/products/${id}`),
  byBarcode: (code: string) =>
    apiRequest<{ product: Product; variantId: string }>(
      `/products/barcode/${encodeURIComponent(code)}`,
    ),
  createProduct: (body: ProductInput) => apiRequest<Product>('/products', { method: 'POST', body }),
  updateProduct: (id: string, body: ProductInput) =>
    apiRequest<Product>(`/products/${id}`, { method: 'PATCH', body }),
  addVariant: (productId: string, body: VariantInput) =>
    apiRequest<Product>(`/products/${productId}/variants`, { method: 'POST', body }),
  updateVariant: (variantId: string, body: VariantInput) =>
    apiRequest<Product>(`/products/variants/${variantId}`, { method: 'PATCH', body }),
  addBarcode: (variantId: string, code: string) =>
    apiRequest<Product>(`/products/variants/${variantId}/barcodes`, {
      method: 'POST',
      body: { code },
    }),
  removeBarcode: (barcodeId: string) =>
    apiRequest<Product>(`/products/barcodes/${barcodeId}`, { method: 'DELETE' }),

  checkSerial: (number: string, type: SerialType = 'IMEI') =>
    apiRequest<SerialCheck>(`/serial-numbers/check${toQueryString({ number, type })}`),
  findSerial: (number: string) =>
    apiRequest<SerialUnit>(`/serial-numbers/${encodeURIComponent(number)}`),
};
