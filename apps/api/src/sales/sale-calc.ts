import { HttpStatus } from '@nestjs/common';
import { ErrorCode, type PaymentMethod } from '@myshop/shared';
import { Prisma } from '@myshop/database';
import { AppException } from '../common/errors/app.exception.js';

const D = (value: Prisma.Decimal | string | number) => new Prisma.Decimal(value);
const money = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export interface LineInput {
  quantity: number;
  price: string | Prisma.Decimal;
  discount?: string | Prisma.Decimal | null;
}

export interface CalculatedLine {
  quantity: number;
  price: Prisma.Decimal;
  discount: Prisma.Decimal;
  total: Prisma.Decimal;
}

/**
 * Строки чека: сумма = количество × цена − скидка.
 * Скидка не может быть больше суммы строки. Все расчёты — в Decimal, без float.
 */
export function calculateLines(lines: readonly LineInput[]) {
  const calculated: CalculatedLine[] = lines.map((line, index) => {
    const price = money(D(line.price));
    const discount = money(D(line.discount ?? 0));
    const gross = money(price.mul(line.quantity));
    if (discount.isNegative() || discount.greaterThan(gross)) {
      throw new AppException(
        ErrorCode.DISCOUNT_TOO_LARGE,
        HttpStatus.BAD_REQUEST,
        'Discount exceeds line amount',
        {
          line: index,
          amount: gross.toFixed(2),
          discount: discount.toFixed(2),
        },
      );
    }
    return { quantity: line.quantity, price, discount, total: gross.sub(discount) };
  });
  const subtotal = calculated.reduce((sum, line) => sum.add(line.price.mul(line.quantity)), D(0));
  const discountTotal = calculated.reduce((sum, line) => sum.add(line.discount), D(0));
  return {
    lines: calculated,
    subtotal: money(subtotal),
    discountTotal: money(discountTotal),
    total: money(subtotal.sub(discountTotal)),
  };
}

export interface PaymentInput {
  method: PaymentMethod;
  amount: string | Prisma.Decimal;
}

/**
 * Сумма платежей должна точно совпадать с суммой к оплате.
 * В рассрочку (partial) — оплачивается только взнос: меньше суммы к оплате, можно 0.
 */
export function validatePayments(
  total: Prisma.Decimal,
  payments: readonly PaymentInput[],
  { partial = false } = {},
) {
  const normalized = payments.map((p) => ({ method: p.method, amount: money(D(p.amount)) }));
  if (normalized.some((p) => !p.amount.greaterThan(0))) {
    throw new AppException(
      ErrorCode.VALIDATION_ERROR,
      HttpStatus.BAD_REQUEST,
      'Payment amount must be positive',
    );
  }
  const paid = normalized.reduce((sum, p) => sum.add(p.amount), D(0));
  const ok = partial ? paid.lessThan(total) : paid.equals(total) && normalized.length > 0;
  if (!ok) {
    throw new AppException(
      ErrorCode.PAYMENT_MISMATCH,
      HttpStatus.BAD_REQUEST,
      partial ? 'Down payment must be less than total' : 'Payments do not match total',
      {
        total: total.toFixed(2),
        paid: paid.toFixed(2),
      },
    );
  }
  return { payments: normalized, paid };
}

/** Дата окончания гарантии: + N месяцев (конец месяца корректируется, 31 янв + 1 мес = 28/29 фев). */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}
