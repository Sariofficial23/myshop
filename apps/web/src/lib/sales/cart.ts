import type { PaymentMethod } from '@myshop/shared';
import { parseMoneyInput } from '../format/money';

/**
 * Предпросмотр суммы чека на клиенте. Считаем в тийинах/копейках (целые числа), без float.
 * Итог, который попадёт в документ, всё равно пересчитывает и проверяет backend.
 */

/** "11990000.5" → 1199000050. null — если строка не является суммой. */
export function toCents(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

/** 1199000050 → "11990000.50", 1199000000 → "11990000". */
export function fromCents(cents: number): string {
  const whole = Math.trunc(cents / 100);
  const fraction = cents % 100;
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, '0')}`;
}

export interface CartLineAmounts {
  quantity: number;
  priceCents: number;
  discountCents: number;
}

export function lineTotalCents(line: CartLineAmounts): number {
  return line.priceCents * line.quantity - line.discountCents;
}

export function cartTotals(lines: readonly CartLineAmounts[]) {
  const subtotal = lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);
  const discount = lines.reduce((sum, line) => sum + line.discountCents, 0);
  return { subtotal, discount, total: subtotal - discount };
}

export type PaymentMode = PaymentMethod | 'MIXED';

/**
 * Платежи для отправки: один способ — вся сумма им; смешанная — только ненулевые суммы.
 * null — если суммы смешанной оплаты некорректны или не сходятся с итогом.
 */
export function buildPayments(
  mode: PaymentMode,
  totalCents: number,
  mixed: Partial<Record<PaymentMethod, string>>,
): Array<{ method: PaymentMethod; amount: string }> | null {
  if (totalCents <= 0) return null;
  if (mode !== 'MIXED') return [{ method: mode, amount: fromCents(totalCents) }];
  const payments: Array<{ method: PaymentMethod; amount: string }> = [];
  let paid = 0;
  for (const [method, raw] of Object.entries(mixed) as Array<[PaymentMethod, string]>) {
    if (raw.trim() === '') continue;
    const cents = toCents(parseMoneyInput(raw));
    if (cents === null) return null;
    if (cents === 0) continue;
    paid += cents;
    payments.push({ method, amount: fromCents(cents) });
  }
  return paid === totalCents && payments.length > 0 ? payments : null;
}

/** Сколько ещё не распределено по способам оплаты (может быть отрицательным — переплата). */
export function mixedRemainder(
  totalCents: number,
  mixed: Partial<Record<PaymentMethod, string>>,
): number {
  return Object.values(mixed).reduce(
    (rest, raw) => rest - (raw && raw.trim() ? (toCents(parseMoneyInput(raw)) ?? 0) : 0),
    totalCents,
  );
}

/**
 * Рассрочка: первоначальный взнос (можно 0) меньше суммы к оплате, срок 1–60 месяцев.
 * Ежемесячный платёж округляется вверх — как на backend, последний месяц меньше.
 */
export function buildInstallment(
  totalCents: number,
  downPaymentRaw: string,
  downPaymentMethod: PaymentMethod,
  monthsRaw: string,
): {
  payments: Array<{ method: PaymentMethod; amount: string }>;
  debtCents: number;
  monthlyCents: number;
  months: number;
} | null {
  const months = Number(monthsRaw);
  if (!Number.isInteger(months) || months < 1 || months > 60 || totalCents <= 0) return null;
  const down = downPaymentRaw.trim() === '' ? 0 : toCents(parseMoneyInput(downPaymentRaw));
  if (down === null || down >= totalCents) return null;
  const debtCents = totalCents - down;
  return {
    payments: down > 0 ? [{ method: downPaymentMethod, amount: fromCents(down) }] : [],
    debtCents,
    monthlyCents: Math.ceil(debtCents / months),
    months,
  };
}
