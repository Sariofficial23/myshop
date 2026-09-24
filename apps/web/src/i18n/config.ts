import { DEFAULT_LOCALE, isLocale, type Locale } from '@myshop/shared';

export const LOCALE_COOKIE = 'NEXT_LOCALE';

/** Язык по умолчанию — русский (MVP). Можно переопределить через NEXT_PUBLIC_DEFAULT_LOCALE. */
export const defaultLocale: Locale = isLocale(process.env.NEXT_PUBLIC_DEFAULT_LOCALE)
  ? process.env.NEXT_PUBLIC_DEFAULT_LOCALE
  : DEFAULT_LOCALE;

export function resolveLocale(value: string | undefined): Locale {
  return isLocale(value) ? value : defaultLocale;
}
