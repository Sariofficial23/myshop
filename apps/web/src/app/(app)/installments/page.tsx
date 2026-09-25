'use client';

import { Card, cn, ListRow, StatusBadge } from '@myshop/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { installmentsApi } from '@/lib/api/finance';
import { useMoney } from '@/lib/hooks/use-money';

const FILTERS = ['active', 'overdue', 'paid'] as const;
type Filter = (typeof FILTERS)[number];

export default function InstallmentsPage() {
  const t = useTranslations();
  const format = useFormatter();
  const money = useMoney();
  const [filter, setFilter] = useState<Filter>('active');
  const installments = useQuery({
    queryKey: ['installments', filter],
    queryFn: () =>
      installmentsApi.list(
        filter === 'paid'
          ? { status: 'PAID' }
          : { status: 'ACTIVE', overdue: filter === 'overdue' },
      ),
  });
  const data = installments.data;

  return (
    <>
      <PageHeader title={t('installments.title')} backHref="/more" backLabel={t('common.back')} />
      <nav className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              'min-h-10 rounded-full px-4 text-sm font-semibold',
              filter === f
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200',
            )}
          >
            {t(`installments.filter_${f}`)}
          </button>
        ))}
      </nav>
      {data && filter !== 'paid' ? (
        <Card>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-sm text-slate-500">{t('installments.totalDebt')}</p>
              <p className="text-lg font-bold">{money(data.totals.remaining)}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">{t('installments.totalOverdue')}</p>
              <p
                className={cn(
                  'text-lg font-bold',
                  Number(data.totals.overdue) > 0 ? 'text-red-600' : 'text-slate-900',
                )}
              >
                {money(data.totals.overdue)}
              </p>
            </div>
          </div>
        </Card>
      ) : null}
      <ErrorMessage error={installments.error} />
      {data?.items.length === 0 ? (
        <p className="py-6 text-center text-slate-500">{t('installments.empty')}</p>
      ) : null}
      {data?.items.length ? (
        <Card className="p-0">
          <ul className="divide-y divide-slate-100">
            {data.items.map((item) => (
              <li key={item.id}>
                <Link href={`/installments/${item.id}`} className="block active:bg-slate-50">
                  <ListRow
                    title={item.customer.name}
                    subtitle={[
                      item.sale.displayNumber,
                      item.nextDueDate
                        ? t('installments.nextDue', {
                            date: format.dateTime(new Date(item.nextDueDate), {
                              dateStyle: 'medium',
                            }),
                          })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    trailing={
                      item.status === 'PAID' ? (
                        <StatusBadge tone="success">{t('installmentStatus.PAID')}</StatusBadge>
                      ) : (
                        <span className="text-right">
                          <span className="block font-semibold">{money(item.remaining)}</span>
                          {Number(item.overdueAmount) > 0 ? (
                            <span className="block text-sm text-red-600">
                              {t('installments.overdueShort', {
                                value: money(item.overdueAmount),
                              })}
                            </span>
                          ) : null}
                        </span>
                      )
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
