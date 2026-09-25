import { describe, expect, it } from 'vitest';
import { periodRange } from './period';

describe('periodRange', () => {
  const now = new Date(2026, 2, 1, 15, 30); // 1 марта 2026

  it('today, yesterday across a month boundary, last 7 days, month to date', () => {
    expect(periodRange('today', now)).toEqual({ from: '2026-03-01', to: '2026-03-01' });
    expect(periodRange('yesterday', now)).toEqual({ from: '2026-02-28', to: '2026-02-28' });
    expect(periodRange('week', now)).toEqual({ from: '2026-02-23', to: '2026-03-01' });
    expect(periodRange('month', now)).toEqual({ from: '2026-03-01', to: '2026-03-01' });
  });
});
