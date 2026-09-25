import { isValidImei } from '@myshop/shared';
import { describe, expect, it } from 'vitest';
import { demoImei } from './demo-imei.js';

describe('demoImei', () => {
  it('produces distinct valid IMEI numbers', () => {
    const numbers = Array.from({ length: 200 }, (_, i) => demoImei(i + 1));
    expect(new Set(numbers).size).toBe(200);
    for (const number of numbers) expect(isValidImei(number)).toBe(true);
  });
});
