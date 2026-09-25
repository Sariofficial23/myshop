import { Prisma } from '@myshop/database';

type DecimalLike = Prisma.Decimal | string | number;
const D = (value: DecimalLike) => new Prisma.Decimal(value);

/**
 * Средневзвешенная себестоимость после поступления:
 *   (остаток × старая_себестоимость + приход × цена_прихода) / (остаток + приход)
 * Округление до 2 знаков (half-up). Если остатка не было — себестоимость = цена прихода.
 */
export function weightedAverageCost(
  currentQuantity: number,
  currentAvgCost: DecimalLike,
  incomingQuantity: number,
  incomingUnitCost: DecimalLike,
): Prisma.Decimal {
  if (incomingQuantity <= 0) throw new Error('incomingQuantity must be positive');
  const current = Math.max(currentQuantity, 0);
  const total = current + incomingQuantity;
  return D(currentAvgCost)
    .mul(current)
    .add(D(incomingUnitCost).mul(incomingQuantity))
    .div(total)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Сумма строки документа: количество × цена, 2 знака. */
export function lineTotal(quantity: number, unitPrice: DecimalLike): Prisma.Decimal {
  return D(unitPrice).mul(quantity).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function sumDecimals(values: readonly DecimalLike[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((acc, value) => acc.add(D(value)), D(0));
}

/** Новый остаток после движения; null — если остатка не хватает. */
export function nextBalance(current: number, delta: number): number | null {
  const next = current + delta;
  return next < 0 ? null : next;
}
