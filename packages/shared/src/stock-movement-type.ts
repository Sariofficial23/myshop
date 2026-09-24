/**
 * Главное бизнес-правило MyShop: остаток товара меняется ТОЛЬКО через
 * документированную операцию. Каждое движение товара (StockMovement) обязано
 * иметь один из этих типов и ссылку на документ-источник.
 */
export const StockMovementType = {
  PURCHASE: 'PURCHASE',
  SALE: 'SALE',
  RETURN: 'RETURN',
  TRANSFER_IN: 'TRANSFER_IN',
  TRANSFER_OUT: 'TRANSFER_OUT',
  WRITE_OFF: 'WRITE_OFF',
  INVENTORY_ADJUSTMENT: 'INVENTORY_ADJUSTMENT',
} as const;

export type StockMovementType = (typeof StockMovementType)[keyof typeof StockMovementType];

export const STOCK_MOVEMENT_TYPES: readonly StockMovementType[] = Object.values(StockMovementType);
