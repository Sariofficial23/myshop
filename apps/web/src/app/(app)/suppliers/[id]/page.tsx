'use client';

import { Card, ListRow, StatusBadge } from '@myshop/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { cardsApi } from '@/lib/api/finance';
import { useMoney } from '@/lib/hooks/use-money';

/** Карточка поставщика: контакты, сумма и история приходов. */
export default function SupplierCardPage() {
  const t = useTranslations();
  const format = useFormatter();
  const money = useMoney();
  const { id } = useParams<{ id: string }>();
  const card = useQuery({ queryKey: ['suppliers', id], queryFn: () => cardsApi.supplier(id) });
  const s = card.data;
  const date = (value: string) => format.dateTime(new Date(value), { dateStyle: 'medium' });

  return (
    <>
      <PageHeader
        title={s ? s.name : t('suppliers.title')}
        backHref="/suppliers"
        backLabel={t('common.back')}
      />
      <ErrorMessage error={card.error} />
      {s ? (
        <>
          <Card>
            <div className="flex flex-col gap-1 text-slate-700">
              {s.contact ? <p>{s.contact}</p> : null}
              {s.phone ? (
                <a href={`tel:${s.phone}`} className="font-semibold text-brand-600">
                  {s.phone}
                </a>
              ) : null}
              {s.notes ? <p className="text-sm text-slate-600">{s.notes}</p> : null}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-sm text-slate-500">{t('suppliers.purchasesCount')}</p>
                <p className="text-lg font-bold">{s.stats.purchasesCount}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">{t('suppliers.totalPurchased')}</p>
                <p className="text-lg font-bold">{money(s.stats.totalPurchased)}</p>
              </div>
            </div>
            {s.stats.lastPurchaseAt ? (
              <p className="mt-2 text-sm text-slate-500">
                {t('suppliers.lastPurchase', { date: date(s.stats.lastPurchaseAt) })}
              </p>
            ) : null}
          </Card>
          <Card title={t('purchases.title')} className="p-0">
            {s.purchases.length ? (
              <ul className="divide-y divide-slate-100">
                {s.purchases.map((p) => (
                  <li key={p.id}>
                    <Link href={`/purchases/${p.id}`} className="block active:bg-slate-50">
                      <ListRow
                        title={`${p.displayNumber} · ${money(p.total)}`}
                        subtitle={[date(p.date), p.branch.name, p.documentNumber]
                          .filter(Boolean)
                          .join(' · ')}
                        trailing={
                          <StatusBadge tone={p.status === 'CONFIRMED' ? 'success' : 'neutral'}>
                            {t(`documentStatus.${p.status}`)}
                          </StatusBadge>
                        }
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 pb-4 text-slate-500">{t('purchases.empty')}</p>
            )}
          </Card>
        </>
      ) : null}
    </>
  );
}
