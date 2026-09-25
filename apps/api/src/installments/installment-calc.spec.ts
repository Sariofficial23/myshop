import { describe, expect, it } from 'vitest';
import { buildSchedule, installmentState, monthlyAmount } from './installment-calc.js';

const base = {
  total: '1000.00',
  reducedAmount: '0',
  paidAmount: '0',
  months: 3,
  monthlyAmount: monthlyAmount('1000.00', 3),
  firstDueDate: new Date('2026-10-31T00:00:00Z'),
};

describe('installment schedule', () => {
  it('splits into equal monthly payments, the last one takes the remainder', () => {
    expect(base.monthlyAmount.toFixed(2)).toBe('333.34');
    const rows = buildSchedule(base);
    expect(rows.map((r) => r.amount.toFixed(2))).toEqual(['333.34', '333.34', '333.32']);
    // 31 окт + 1 мес = 30 ноя (конец месяца)
    expect(rows.map((r) => r.dueDate.toISOString().slice(0, 10))).toEqual([
      '2026-10-31',
      '2026-11-30',
      '2026-12-31',
    ]);
  });

  it('payments cover rows in order; overdue counts only past due dates', () => {
    const state = installmentState(
      { ...base, paidAmount: '400' },
      new Date('2026-12-01T10:00:00Z'),
    );
    expect(state.remaining.toFixed(2)).toBe('600.00');
    // Просрочены 31 окт (оплачен) и 30 ноя (покрыто 66.66 из 333.34)
    expect(state.overdueAmount.toFixed(2)).toBe('266.68');
    expect(state.nextDueDate?.toISOString().slice(0, 10)).toBe('2026-11-30');
    expect(state.nextDueAmount?.toFixed(2)).toBe('266.68');
  });

  it('a return reduces the debt and shortens the schedule', () => {
    const rows = buildSchedule({ ...base, reducedAmount: '500' });
    expect(rows.map((r) => r.amount.toFixed(2))).toEqual(['333.34', '166.66']);
    const paidOff = installmentState(
      { ...base, reducedAmount: '500', paidAmount: '500' },
      new Date('2027-06-01T00:00:00Z'),
    );
    expect(paidOff.remaining.toFixed(2)).toBe('0.00');
    expect(paidOff.overdueAmount.toFixed(2)).toBe('0.00');
    expect(paidOff.nextDueDate).toBeNull();
  });
});
