'use client';

import { isValidImei, normalizeImei } from '@myshop/shared';
import { Card, StatusBadge } from '@myshop/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { catalogApi } from '@/lib/api/catalog';

/** Если в поиск введён IMEI (15 цифр) — сразу показываем, где эта единица и её статус. */
export function ImeiLookup({ query }: { query: string }) {
  const t = useTranslations();
  const imei = normalizeImei(query);
  const looksLikeImei = /^\d{15}$/.test(imei);
  const valid = looksLikeImei && isValidImei(imei);
  const unit = useQuery({
    queryKey: ['serial', imei],
    queryFn: () => catalogApi.findSerial(imei),
    enabled: valid,
    retry: false,
  });

  if (!looksLikeImei) return null;
  if (!valid)
    return (
      <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">
        {t('products.imeiInvalid')}
      </p>
    );
  if (unit.isPending) return null;
  if (!unit.data)
    return (
      <p className="rounded-2xl bg-slate-100 p-3 text-sm text-slate-600">
        {t('products.imeiNotFound')}
      </p>
    );

  return (
    <Link href={`/products/${unit.data.variant.product.id}`}>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono font-semibold">
              {t('products.imeiTitle', { number: unit.data.number })}
            </p>
            <p className="truncate text-sm text-slate-600">
              {t('products.imeiStatus', {
                product: [unit.data.variant.product.name, unit.data.variant.name]
                  .filter(Boolean)
                  .join(' '),
                branch: unit.data.branch.name,
              })}
            </p>
          </div>
          <StatusBadge tone={unit.data.status === 'IN_STOCK' ? 'success' : 'neutral'}>
            {t(`serialStatus.${unit.data.status}`)}
          </StatusBadge>
        </div>
      </Card>
    </Link>
  );
}
