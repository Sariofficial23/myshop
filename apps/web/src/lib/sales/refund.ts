import { toCents } from './cart';

/**
 * Предпросмотр суммы возврата (в копейках) — та же формула, что на backend:
 * пропорционально сумме строки, последний возврат забирает остаток суммы.
 * Окончательную сумму считает и фиксирует backend.
 */
export function estimateRefundCents(
  line: { quantity: number; total: string; returnedQuantity: number; refundedAmount: string },
  qty: number,
): number {
  const remainingQty = line.quantity - line.returnedQuantity;
  if (qty <= 0 || qty > remainingQty) return 0;
  const total = toCents(Number(line.total).toFixed(2)) ?? 0;
  const refunded = toCents(Number(line.refundedAmount).toFixed(2)) ?? 0;
  if (qty === remainingQty) return total - refunded;
  return Math.min(Math.round((total * qty) / line.quantity), total - refunded);
}
