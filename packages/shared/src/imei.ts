/**
 * IMEI: 15 цифр, последняя — контрольная (алгоритм Луна).
 * Серийные номера (не IMEI) проверяются мягче: 3–64 символа [A-Z0-9-/.].
 */
export const SerialType = {
  IMEI: 'IMEI',
  SERIAL: 'SERIAL',
} as const;

export type SerialType = (typeof SerialType)[keyof typeof SerialType];

/** Убирает пробелы и дефисы, которые часто встречаются при ручном вводе IMEI. */
export function normalizeImei(value: string): string {
  return value.replace(/[\s-]/g, '');
}

export function luhnCheck(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

export function isValidImei(value: string): boolean {
  const imei = normalizeImei(value);
  return /^\d{15}$/.test(imei) && luhnCheck(imei);
}

export function normalizeSerial(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidSerial(value: string): boolean {
  return /^[A-Z0-9][A-Z0-9\-/.]{2,63}$/.test(normalizeSerial(value));
}

export function isValidSerialNumber(type: SerialType, value: string): boolean {
  return type === SerialType.IMEI ? isValidImei(value) : isValidSerial(value);
}

export function normalizeSerialNumber(type: SerialType, value: string): string {
  return type === SerialType.IMEI ? normalizeImei(value) : normalizeSerial(value);
}
