import { Prisma } from '@myshop/database';

const D = (value: Prisma.Decimal | string | number) => new Prisma.Decimal(value);

export interface SaleLineState {
  quantity: number;
  total: Prisma.Decimal | string;
  returnedQuantity: number;
  refundedAmount: Prisma.Decimal | string;
}

/**
 * Сумма возврата за qty единиц строки чека (со скидкой строки).
 * Пропорционально сумме строки; последний возврат забирает остаток суммы,
 * поэтому копейки от округления не теряются и не возвращаются дважды.
 */
export function refundAmount(line: SaleLineState, qty: number): Prisma.Decimal {
  const remainingQty = line.quantity - line.returnedQuantity;
  if (qty <= 0 || qty > remainingQty) throw new Error('Invalid return quantity');
  const remainingMoney = D(line.total).sub(line.refundedAmount);
  if (qty === remainingQty) return remainingMoney;
  const share = D(line.total)
    .mul(qty)
    .div(line.quantity)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return Prisma.Decimal.min(share, remainingMoney);
}
