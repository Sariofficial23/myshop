import type { Locale } from '@myshop/shared';

const LOCALE_TAGS: Record<Locale, string> = { ru: 'ru-RU', uz: 'uz-UZ' };

/**
 * Деньги приходят с сервера строкой ("11990000.00"). Для отображения переводим в число —
 * это безопасно для показа (не для расчётов: расчёты делает только backend).
 */
export function formatMoney(
  value: string | null | undefined,
  currency: string,
  locale: Locale,
): string {
  if (value === null || value === undefined || value === '') return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  const fractionDigits = Number.isInteger(amount) ? 0 : 2;
  try {
    return new Intl.NumberFormat(LOCALE_TAGS[locale], {
      style: 'currency',
      currency,
      currencyDisplay: currency === 'UZS' ? 'code' : 'symbol',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString(LOCALE_TAGS[locale])} ${currency}`;
  }
}

/** "11 990 000" → "11990000": разрешаем вводить цену с пробелами и запятой. */
export function parseMoneyInput(input: string): string | null {
  const cleaned = input.replace(/[\s ]/g, '').replace(',', '.');
  if (cleaned === '') return null;
  return /^\d{1,12}(\.\d{1,2})?$/.test(cleaned) ? cleaned : null;
}
