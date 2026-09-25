/** Детерминированный корректный IMEI (контрольная цифра Луна). */
export function demoImei(index: number): string {
  const body = `35${String(900000000000 + index).padStart(12, '0')}`.slice(0, 14);
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let digit = Number(body[13 - i]);
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return body + ((10 - (sum % 10)) % 10);
}
