'use client';

import { Card, ListRow, StatusBadge } from '@myshop/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { StockTabs } from '@/components/stock/stock-tabs';
import { inventoriesApi } from '@/lib/api/documents';

export default function InventoriesPage() {
  const t = useTranslations();
  const format = useFormatter();
  const inventories = useQuery({
    queryKey: ['inventories'],
    queryFn: () => inventoriesApi.list(),
  });
  return (
    <>
      <StockTabs />
      <PageHeader
        title={t('inventories.title')}
        action={
          <Link
            href="/inventories/new"
            className="flex min-h-11 items-center rounded-2xl bg-brand-600 px-4 font-semibold text-white active:bg-brand-800"
          >
            + {t('inventories.add')}
          </Link>
        }
      />
      <ErrorMessage error={inventories.error} />
      {inventories.data?.items.length === 0 ? (
        <p className="py-6 text-center text-slate-500">{t('inventories.empty')}</p>
      ) : null}
      {inventories.data?.items.length ? (
        <Card className="p-0">
          <ul className="divide-y divide-slate-100">
            {inventories.data.items.map((d) => (
              <li key={d.id}>
                <Link href={`/inventories/${d.id}`} className="block active:bg-slate-50">
                  <ListRow
                    title={`${d.displayNumber} · ${d.branch.name}`}
                    subtitle={[
                      format.dateTime(new Date(d.createdAt), { dateStyle: 'medium' }),
                      t('inventories.positions', { count: d.itemsCount }),
                    ].join(' · ')}
                    trailing={
                      <StatusBadge tone={d.status === 'CONFIRMED' ? 'success' : 'neutral'}>
                        {t(`documentStatus.${d.status}`)}
                      </StatusBadge>
                    }
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
