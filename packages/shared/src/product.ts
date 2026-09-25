/** Единицы измерения товара. */
export const ProductUnit = {
  PCS: 'PCS',
  SET: 'SET',
  PAIR: 'PAIR',
  M: 'M',
  KG: 'KG',
} as const;

export type ProductUnit = (typeof ProductUnit)[keyof typeof ProductUnit];

export const PRODUCT_UNITS: readonly ProductUnit[] = Object.values(ProductUnit);

/** Статусы IMEI / серийного номера (ТЗ, раздел 6). */
export const SerialStatus = {
  IN_STOCK: 'IN_STOCK',
  SOLD: 'SOLD',
  RETURNED: 'RETURNED',
  TRANSFERRED: 'TRANSFERRED',
  WRITTEN_OFF: 'WRITTEN_OFF',
} as const;

export type SerialStatus = (typeof SerialStatus)[keyof typeof SerialStatus];

/** Нормализация штрихкода: без пробелов по краям, без внутренних пробелов. */
export function normalizeBarcode(value: string): string {
  return value.replace(/\s+/g, '');
}

export function isValidBarcode(value: string): boolean {
  return /^[\x21-\x7E]{4,64}$/.test(normalizeBarcode(value));
}
