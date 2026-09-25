import { describe, expect, it } from 'vitest';
import { companyNameKey, normalizeLogin, subscriptionState } from './index.js';

describe('subscription', () => {
  const now = new Date('2026-09-25T12:00:00Z');

  it('active until paidUntil, then read-only', () => {
    expect(subscriptionState('ACTIVE', null, now)).toBe('ACTIVE');
    expect(subscriptionState('ACTIVE', '2026-10-01T00:00:00Z', now)).toBe('ACTIVE');
    expect(subscriptionState('ACTIVE', '2026-09-25T11:59:00Z', now)).toBe('EXPIRED');
  });

  it('pending and blocked win over the date', () => {
    expect(subscriptionState('PENDING', null, now)).toBe('PENDING');
    expect(subscriptionState('BLOCKED', '2030-01-01T00:00:00Z', now)).toBe('BLOCKED');
  });

  it('normalizes company names and logins', () => {
    expect(companyNameKey('  Apple   Store ')).toBe('apple store');
    expect(normalizeLogin(' Ali.Seller ')).toBe('ali.seller');
  });
});
