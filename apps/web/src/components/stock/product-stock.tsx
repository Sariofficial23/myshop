'use client';

import { Card, ListRow } from '@myshop/ui';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { stockApi } from '@/lib/api/stock';

/** Остатки варианта по филиалам и история движений (приход → перемещение → продажа → возврат). */
export function ProductStock({ variantIds }: { variantIds: string[] }) {
  const t = useTranslations();
  const format = useFormatter();
  const balances = useQuery({
    queryKey: ['stock', { all: true }],
    queryFn: () => stockApi.balances(),
  });
  const movements = useQuery({
    queryKey: ['stock', 'movements', variantIds],
    queryFn: async () =>
      (await Promise.all(variantIds.map((variantId) => stockApi.movements({ variantId }))))
        .flat()
        .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
  const rows = balances.data?.filter((row) => variantIds.includes(row.variant.id)) ?? [];

  return (
    <>
      <Card title={t('stock.byBranch')}>
        {rows.length === 0 ? (
          <p className="text-slate-500">{t('stock.noStock')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => (
              <li
                key={`${row.branch.id}-${row.variant.id}`}
                className="flex items-center justify-between py-2"
              >
                <span>
                  {row.branch.name}
                  {variantIds.length > 1 && row.variant.name ? ` · ${row.variant.name}` : ''}
                </span>
                <span className={row.low ? 'font-bold text-red-600' : 'font-bold'}>
                  {row.quantity}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={t('stock.history')} className="p-0 pt-4">
        {movements.data?.length ? (
          <ul className="divide-y divide-slate-100">
            {movements.data.slice(0, 30).map((m) => (
              <li key={m.id}>
                <ListRow
                  title={`${t(`movementType.${m.type}`)} ${m.quantity > 0 ? `+${m.quantity}` : m.quantity}`}
                  subtitle={[
                    format.dateTime(new Date(m.createdAt), {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }),
                    m.branch.name,
                    m.purchase ? `ПР-${m.purchase.number}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  trailing={
                    <span className="text-sm">
                      {t('stock.balanceAfter', { count: m.balanceAfter })}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 pb-4 text-slate-500">{t('stock.noHistory')}</p>
        )}
      </Card>
    </>
  );
}
