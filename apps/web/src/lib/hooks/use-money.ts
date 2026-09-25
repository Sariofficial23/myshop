import { isLocale } from '@myshop/shared';
import { useLocale } from 'next-intl';
import { useCallback } from 'react';
import { useMe } from '../auth/auth-provider';
import { formatMoney } from '../format/money';

/** Форматирование цены в валюте компании на языке пользователя. */
export function useMoney(): (value: string | null | undefined) => string {
  const me = useMe();
  const locale = useLocale();
  return useCallback(
    (value) => formatMoney(value, me.company.currency, isLocale(locale) ? locale : 'ru'),
    [me.company.currency, locale],
  );
}
