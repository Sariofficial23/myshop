import { describe, expect, it } from 'vitest';
import {
  isValidBarcode,
  isValidImei,
  isValidSerial,
  isValidSerialNumber,
  luhnCheck,
  normalizeBarcode,
  normalizeImei,
  normalizeSerialNumber,
} from './index.js';

describe('IMEI validation', () => {
  it('accepts valid IMEI numbers (Luhn check digit)', () => {
    expect(isValidImei('490154203237518')).toBe(true);
    expect(isValidImei('356938035643809')).toBe(true);
  });

  it('accepts IMEI typed with spaces or dashes', () => {
    expect(normalizeImei('49-015420-323751-8')).toBe('490154203237518');
    expect(isValidImei('49 015420 323751 8')).toBe(true);
  });

  it('rejects wrong check digit, length or characters', () => {
    expect(isValidImei('490154203237519')).toBe(false);
    expect(isValidImei('49015420323751')).toBe(false);
    expect(isValidImei('4901542032375180')).toBe(false);
    expect(isValidImei('49015420323751A')).toBe(false);
    expect(isValidImei('')).toBe(false);
  });

  it('luhnCheck handles non-digit input', () => {
    expect(luhnCheck('79927398713')).toBe(true);
    expect(luhnCheck('79927398710')).toBe(false);
    expect(luhnCheck('abc')).toBe(false);
  });
});

describe('serial numbers', () => {
  it('normalizes to upper case and validates allowed characters', () => {
    expect(normalizeSerialNumber('SERIAL', ' c02xk1abjg5h ')).toBe('C02XK1ABJG5H');
    expect(isValidSerial('C02XK1ABJG5H')).toBe(true);
    expect(isValidSerial('AB')).toBe(false);
    expect(isValidSerial('BAD SERIAL')).toBe(false);
  });

  it('dispatches validation by type', () => {
    expect(isValidSerialNumber('IMEI', '490154203237518')).toBe(true);
    expect(isValidSerialNumber('IMEI', 'C02XK1ABJG5H')).toBe(false);
    expect(isValidSerialNumber('SERIAL', 'C02XK1ABJG5H')).toBe(true);
  });
});

describe('barcodes', () => {
  it('removes whitespace and validates printable ASCII', () => {
    expect(normalizeBarcode(' 4 600000 000017 ')).toBe('4600000000017');
    expect(isValidBarcode('4600000000017')).toBe(true);
    expect(isValidBarcode('ab')).toBe(false);
    expect(isValidBarcode('штрихкод')).toBe(false);
  });
});
