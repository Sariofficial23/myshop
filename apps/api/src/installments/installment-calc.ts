import { Prisma } from '@myshop/database';
import { addMonths } from '../sales/sale-calc.js';

const D = (value: Prisma.Decimal | string | number) => new Prisma.Decimal(value);

/** Ежемесячный платёж: сумма / месяцы, округление до копеек вверх — последний месяц меньше. */
export function monthlyAmount(total: Prisma.Decimal | string, months: number): Prisma.Decimal {
  return D(total).div(months).toDecimalPlaces(2, Prisma.Decimal.ROUND_UP);
}

export interface ScheduleRow {
  dueDate: Date;
  amount: Prisma.Decimal;
  /** Сколько по этой строке уже покрыто платежами (и возвратами), по порядку. */
  covered: Prisma.Decimal;
}

/**
 * График платежей. Оплаченное (платежи + уменьшение долга возвратами) гасит строки по порядку.
 * Уменьшение долга возвратом уменьшает и сумму графика: график строится от фактического долга.
 */
export function buildSchedule(input: {
  total: Prisma.Decimal | string;
  reducedAmount: Prisma.Decimal | string;
  paidAmount: Prisma.Decimal | string;
  months: number;
  monthlyAmount: Prisma.Decimal | string;
  firstDueDate: Date;
}): ScheduleRow[] {
  const debt = D(input.total).sub(input.reducedAmount);
  let left = debt;
  let paid = D(input.paidAmount);
  const rows: ScheduleRow[] = [];
  for (let i = 0; i < input.months && left.greaterThan(0); i++) {
    const isLast = i === input.months - 1;
    const amount = isLast ? left : Prisma.Decimal.min(D(input.monthlyAmount), left);
    const covered = Prisma.Decimal.min(paid, amount);
    paid = paid.sub(covered);
    left = left.sub(amount);
    rows.push({ dueDate: addMonths(input.firstDueDate, i), amount, covered });
  }
  return rows;
}

/** Остаток долга, просрочка на дату и ближайший платёж. */
export function installmentState(
  input: Parameters<typeof buildSchedule>[0],
  today: Date,
): {
  remaining: Prisma.Decimal;
  overdueAmount: Prisma.Decimal;
  nextDueDate: Date | null;
  nextDueAmount: Prisma.Decimal | null;
  schedule: ScheduleRow[];
} {
  const schedule = buildSchedule(input);
  const remaining = D(input.total).sub(input.reducedAmount).sub(input.paidAmount);
  const overdueAmount = schedule
    .filter((row) => row.dueDate < startOfDay(today))
    .reduce((sum, row) => sum.add(row.amount.sub(row.covered)), D(0));
  const next = schedule.find((row) => row.covered.lessThan(row.amount));
  return {
    remaining,
    overdueAmount,
    nextDueDate: next?.dueDate ?? null,
    nextDueAmount: next ? next.amount.sub(next.covered) : null,
    schedule,
  };
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
