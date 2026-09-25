export const PERIODS = ['today', 'yesterday', 'week', 'month'] as const;
export type Period = (typeof PERIODS)[number];

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Даты периода (по локальному календарю устройства): неделя — последние 7 дней, месяц — с 1-го числа. */
export function periodRange(period: Period, now: Date): { from: string; to: string } {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (period) {
    case 'today':
      return { from: iso(day), to: iso(day) };
    case 'yesterday': {
      const y = new Date(day);
      y.setDate(y.getDate() - 1);
      return { from: iso(y), to: iso(y) };
    }
    case 'week': {
      const start = new Date(day);
      start.setDate(start.getDate() - 6);
      return { from: iso(start), to: iso(day) };
    }
    case 'month':
      return { from: iso(new Date(day.getFullYear(), day.getMonth(), 1)), to: iso(day) };
  }
}
