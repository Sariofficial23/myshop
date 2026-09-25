'use client';

import { Button, Card, cn, ListRow, StatusBadge } from '@myshop/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { CustomerForm } from '@/components/customers/customer-form';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { cardsApi } from '@/lib/api/finance';
import { useMoney } from '@/lib/hooks/use-money';

/** Карточка клиента: покупки, сумма, долг и просрочка по рассрочкам. */
export default function CustomerCardPage() {
  const t = useTranslations();
  const format = useFormatter();
  const money = useMoney();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const [editing, setEditing] = useState(false);
  const card = useQuery({ queryKey: ['customers', id], queryFn: () => cardsApi.customer(id) });
  const c = card.data;
  const date = (value: string) => format.dateTime(new Date(value), { dateStyle: 'medium' });

  return (
    <>
      <PageHeader
        title={c ? c.name : t('customers.title')}
        backHref="/customers"
        backLabel={t('common.back')}
        action={
          c && !editing ? (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t('common.edit')}
            </Button>
          ) : null
        }
      />
      <ErrorMessage error={card.error} />
      {c && editing ? (
        <CustomerForm
          customer={c}
          onDone={() => {
            setEditing(false);
            void queryClient.invalidateQueries({ queryKey: ['customers'] });
          }}
        />
      ) : null}
      {c ? (
        <>
          <Card>
            <div className="flex flex-col gap-1">
              {c.phone ? (
                <a href={`tel:${c.phone}`} className="text-lg font-semibold text-brand-600">
                  {c.phone}
                </a>
              ) : null}
              {c.notes ? <p className="text-sm text-slate-600">{c.notes}</p> : null}
              {!c.isActive ? (
                <StatusBadge tone="neutral">{t('common.inactive')}</StatusBadge>
              ) : null}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-sm text-slate-500">{t('customers.purchases')}</p>
                <p className="text-lg font-bold">{c.stats.salesCount}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">{t('customers.totalSpent')}</p>
                <p className="text-lg font-bold">{money(c.stats.totalSpent)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">{t('customers.debtTitle')}</p>
                <p
                  className={cn('text-lg font-bold', Number(c.stats.debt) > 0 && 'text-amber-700')}
                >
                  {money(c.stats.debt)}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-500">{t('customers.overdue')}</p>
                <p
                  className={cn('text-lg font-bold', Number(c.stats.overdue) > 0 && 'text-red-600')}
                >
                  {money(c.stats.overdue)}
                </p>
              </div>
            </div>
            {c.stats.lastPurchaseAt ? (
              <p className="mt-2 text-sm text-slate-500">
                {t('customers.lastPurchase', { date: date(c.stats.lastPurchaseAt) })}
              </p>
            ) : null}
          </Card>

          {c.installments.length ? (
            <Card title={t('installments.title')} className="p-0">
              <ul className="divide-y divide-slate-100">
                {c.installments.map((i) => (
                  <li key={i.id}>
                    <Link href={`/installments/${i.id}`} className="block active:bg-slate-50">
                      <ListRow
                        title={i.saleDisplayNumber}
                        subtitle={
                          i.nextDueDate
                            ? t('installments.nextDue', { date: date(i.nextDueDate) })
                            : undefined
                        }
                        trailing={
                          <span className="text-right">
                            <span className="block font-semibold">{money(i.remaining)}</span>
                            {Number(i.overdueAmount) > 0 ? (
                              <span className="block text-sm text-red-600">
                                {t('installments.overdueShort', {
                                  value: money(i.overdueAmount),
                                })}
                              </span>
                            ) : null}
                          </span>
                        }
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title={t('customers.history')} className="p-0">
            {c.sales.length ? (
              <ul className="divide-y divide-slate-100">
                {c.sales.map((sale) => (
                  <li key={sale.id}>
                    <Link href={`/sales/${sale.id}`} className="block active:bg-slate-50">
                      <ListRow
                        title={`${sale.displayNumber} · ${money(sale.total)}`}
                        subtitle={`${date(sale.date)} · ${sale.branch.name}`}
                        trailing={
                          sale.status === 'COMPLETED' ? (
                            <span className="text-sm text-slate-500">
                              {t(`paymentMethod.${sale.paymentType}`)}
                            </span>
                          ) : (
                            <StatusBadge tone="danger">
                              {t(`saleStatus.${sale.status}`)}
                            </StatusBadge>
                          )
                        }
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 pb-4 text-slate-500">{t('customers.noPurchases')}</p>
            )}
          </Card>
        </>
      ) : null}
    </>
  );
}
