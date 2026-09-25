'use client';

import { Card, ListRow, StatusBadge } from '@myshop/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { StockTabs } from '@/components/stock/stock-tabs';
import { purchasesApi } from '@/lib/api/stock';
import { useMoney } from '@/lib/hooks/use-money';

export default function PurchasesPage() {
  const t = useTranslations();
  const format = useFormatter();
  const money = useMoney();
  const purchases = useQuery({ queryKey: ['purchases'], queryFn: () => purchasesApi.list() });

  return (
    <>
      <StockTabs />
      <PageHeader
        title={t('purchases.title')}
        action={
          <Link
            href="/purchases/new"
            className="flex min-h-11 items-center rounded-2xl bg-brand-600 px-4 font-semibold text-white active:bg-brand-800"
          >
            + {t('purchases.add')}
          </Link>
        }
      />
      <ErrorMessage error={purchases.error} />
      {purchases.data?.items.length === 0 ? (
        <p className="py-6 text-center text-slate-500">{t('purchases.empty')}</p>
      ) : null}
      {purchases.data?.items.length ? (
        <Card className="p-0">
          <ul className="divide-y divide-slate-100">
            {purchases.data.items.map((purchase) => (
              <li key={purchase.id}>
                <Link href={`/purchases/${purchase.id}`} className="block active:bg-slate-50">
                  <ListRow
                    title={`${purchase.displayNumber} · ${money(purchase.total)}`}
                    subtitle={[
                      format.dateTime(new Date(purchase.date), { dateStyle: 'medium' }),
                      purchase.branch.name,
                      purchase.supplier?.name,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    trailing={
                      <StatusBadge tone={purchase.status === 'CONFIRMED' ? 'success' : 'neutral'}>
                        {t(`documentStatus.${purchase.status}`)}
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
