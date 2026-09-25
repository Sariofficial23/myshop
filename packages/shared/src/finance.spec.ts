import { describe, expect, it } from 'vitest';
import { canTransitionWarranty } from './finance.js';

describe('warranty claim transitions', () => {
  it('follows received → repair → ready → returned', () => {
    expect(canTransitionWarranty('RECEIVED', 'IN_REPAIR')).toBe(true);
    expect(canTransitionWarranty('IN_REPAIR', 'READY')).toBe(true);
    expect(canTransitionWarranty('READY', 'RETURNED')).toBe(true);
  });

  it('does not reopen closed claims or skip handing over', () => {
    expect(canTransitionWarranty('RETURNED', 'IN_REPAIR')).toBe(false);
    expect(canTransitionWarranty('REJECTED', 'READY')).toBe(false);
    expect(canTransitionWarranty('RECEIVED', 'RETURNED')).toBe(false);
  });
});
