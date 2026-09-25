'use client';

import { Card } from '@myshop/ui';
import { useTranslations } from 'next-intl';
import type { StockDocItem } from '@/lib/api/documents';

/** Строки проведённого складского документа: товар, количество, IMEI. */
export function DocItemsCard({ items }: { items: StockDocItem[] }) {
  const t = useTranslations('stockDocs');
  return (
    <Card title={t('items')} className="p-0">
      <ul className="divide-y divide-slate-100">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex justify-between gap-3">
              <p className="min-w-0 font-semibold">
                {item.variant.product.name}
                {item.variant.name ? (
                  <span className="font-normal text-slate-500"> · {item.variant.name}</span>
                ) : null}
              </p>
              <p className="shrink-0 font-semibold">{t('pcs', { count: item.quantity })}</p>
            </div>
            {item.serialNumbers.length ? (
              <p className="font-mono text-sm break-all text-slate-600">
                {item.serialNumbers.join(', ')}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export const personName = (u: { firstName: string; lastName: string | null }) =>
  [u.firstName, u.lastName].filter(Boolean).join(' ');
