'use client';

import { useTranslations } from 'next-intl';
import { errorMessageKey } from '@/lib/api/api-error';

/** Понятное сообщение об ошибке API на языке пользователя. */
export function ErrorMessage({ error }: { error: unknown }) {
  const t = useTranslations();
  if (!error) return null;
  return (
    <p role="alert" className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">
      {t(errorMessageKey(error))}
    </p>
  );
}
