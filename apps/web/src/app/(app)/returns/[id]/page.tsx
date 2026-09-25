'use client';

import { Card } from '@myshop/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { personName } from '@/components/stock/doc-items-card';
import { returnsApi } from '@/lib/api/documents';
import { useMoney } from '@/lib/hooks/use-money';

export default function ReturnPage() {
  const t = useTranslations();
  const format = useFormatter();
  const money = useMoney();
  const { id } = useParams<{ id: string }>();
  const found = useQuery({ queryKey: ['returns', id], queryFn: () => returnsApi.get(id) });
  const r = found.data;
  return (
    <>
      <PageHeader
        title={r ? r.displayNumber : t('returns.title')}
        backHref={r ? `/sales/${r.sale.id}` : '/sales'}
        backLabel={t('common.back')}
      />
      <ErrorMessage error={found.error} />
      {r ? (
        <>
          <Card>
            <div className="flex flex-col gap-1 text-slate-700">
              <p className="text-3xl font-bold text-slate-900">−{money(r.refundTotal)}</p>
              <p>{format.dateTime(new Date(r.date), { dateStyle: 'long', timeStyle: 'short' })}</p>
              <p>{r.branch.name}</p>
              <Link href={`/sales/${r.sale.id}`} className="font-semibold text-brand-600">
                {t('returns.forSale', { number: r.sale.displayNumber })}
              </Link>
              {r.sale.customer ? (
                <p className="text-sm text-slate-500">
                  {t('sale.customerLine', { name: r.sale.customer.name })}
                </p>
              ) : null}
              <p className="text-sm text-slate-500">
                {t('stockDocs.createdBy', { name: personName(r.createdBy) })}
              </p>
              {r.reason ? <p className="text-sm">{r.reason}</p> : null}
            </div>
          </Card>
          <Card title={t('stockDocs.items')} className="p-0">
            <ul className="divide-y divide-slate-100">
              {r.items.map((item) => (
                <li key={item.id} className="flex flex-col gap-1 px-4 py-3">
                  <div className="flex justify-between gap-3">
                    <p className="min-w-0 font-semibold">
                      {item.variant.product.name}
                      {item.variant.name ? (
                        <span className="font-normal text-slate-500"> · {item.variant.name}</span>
                      ) : null}
                    </p>
                    <p className="shrink-0 font-semibold">{money(item.amount)}</p>
                  </div>
                  <p className="text-sm text-slate-500">
                    {t('stockDocs.pcs', { count: item.quantity })}
                  </p>
                  {item.serialNumbers.length ? (
                    <p className="font-mono text-sm text-slate-600">
                      {item.serialNumbers.join(', ')}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
          <Card title={t('returns.refunds')}>
            {r.refunds.map((refund) => (
              <div key={refund.id} className="flex justify-between">
                <span>{t(`paymentMethod.${refund.method}`)}</span>
                <span className="font-semibold">{money(refund.amount)}</span>
              </div>
            ))}
          </Card>
        </>
      ) : null}
    </>
  );
}
