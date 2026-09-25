'use client';

import { Permission } from '@myshop/shared';
import { Card, ListRow, StatusBadge } from '@myshop/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { salesApi } from '@/lib/api/sales';
import { useCan } from '@/lib/auth/auth-provider';
import { useMoney } from '@/lib/hooks/use-money';

const fullName = (u: { firstName: string; lastName: string | null }) =>
  [u.firstName, u.lastName].filter(Boolean).join(' ');

/** Чек продажи: товары, IMEI с гарантией, оплата. */
export default function SaleReceiptPage() {
  const t = useTranslations();
  const format = useFormatter();
  const money = useMoney();
  const can = useCan();
  const { id } = useParams<{ id: string }>();
  const sale = useQuery({ queryKey: ['sales', id], queryFn: () => salesApi.get(id) });
  const s = sale.data;

  return (
    <>
      <PageHeader
        title={s ? t('sale.receiptTitle', { number: s.displayNumber }) : t('sales.title')}
        backHref={can(Permission.SALES_VIEW) ? '/sales' : '/sale'}
        backLabel={t('common.back')}
      />
      <ErrorMessage error={sale.error} />
      {s ? (
        <>
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1 text-slate-700">
                <p className="text-3xl font-bold text-slate-900">{money(s.total)}</p>
                <p>
                  {format.dateTime(new Date(s.date), { dateStyle: 'long', timeStyle: 'short' })}
                </p>
                <p>{s.branch.name}</p>
                <p className="text-sm text-slate-500">
                  {t('sale.seller', { name: fullName(s.seller) })}
                </p>
                {s.customer ? (
                  <p className="text-sm text-slate-500">
                    {t('sale.customerLine', {
                      name: [s.customer.name, s.customer.phone].filter(Boolean).join(' · '),
                    })}
                  </p>
                ) : null}
              </div>
              <StatusBadge tone={s.status === 'COMPLETED' ? 'success' : 'danger'}>
                {t(`saleStatus.${s.status}`)}
              </StatusBadge>
            </div>
          </Card>

          <Card title={t('sale.items')} className="p-0">
            <ul className="divide-y divide-slate-100">
              {s.items.map((item) => (
                <li key={item.id} className="flex flex-col gap-1 px-4 py-3">
                  <div className="flex justify-between gap-3">
                    <p className="min-w-0 font-semibold">
                      {item.variant.product.name}
                      {item.variant.name ? (
                        <span className="font-normal text-slate-500"> · {item.variant.name}</span>
                      ) : null}
                    </p>
                    <p className="shrink-0 font-semibold">{money(item.total)}</p>
                  </div>
                  <p className="text-sm text-slate-500">
                    {item.quantity} × {money(item.price)}
                    {Number(item.discount) > 0
                      ? ` − ${t('sale.discountShort', { value: money(item.discount) })}`
                      : ''}
                  </p>
                  {item.returnedQuantity > 0 ? (
                    <p className="text-sm font-medium text-amber-700">
                      {t('returns.returnedCount', { count: item.returnedQuantity })}
                    </p>
                  ) : null}
                  {item.serialNumbers.map((serial) => (
                    <p key={serial.id} className="text-sm text-slate-600">
                      <span
                        className={
                          serial.status === 'SOLD'
                            ? 'font-mono'
                            : 'font-mono text-slate-400 line-through'
                        }
                      >
                        {serial.number}
                      </span>
                      {serial.status !== 'SOLD' ? ` · ${t('returns.returned')}` : ''}
                      {serial.status === 'SOLD' && serial.warrantyEnd
                        ? ` · ${t('sale.warrantyUntil', {
                            date: format.dateTime(new Date(serial.warrantyEnd), {
                              dateStyle: 'medium',
                            }),
                          })}`
                        : ''}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </Card>

          <Card title={t('sale.payment')}>
            <dl className="flex flex-col gap-1 text-slate-700">
              {Number(s.discountTotal) > 0 ? (
                <>
                  <div className="flex justify-between">
                    <dt>{t('sale.subtotal')}</dt>
                    <dd>{money(s.subtotal)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{t('sale.discount')}</dt>
                    <dd>−{money(s.discountTotal)}</dd>
                  </div>
                </>
              ) : null}
              {s.payments.map((payment) => (
                <div key={payment.id} className="flex justify-between">
                  <dt>{t(`paymentMethod.${payment.method}`)}</dt>
                  <dd>{money(payment.amount)}</dd>
                </div>
              ))}
              <div className="flex justify-between text-lg font-bold text-slate-900">
                <dt>{t('sale.paid')}</dt>
                <dd>{money(s.paidTotal)}</dd>
              </div>
              {Number(s.refundedTotal) > 0 ? (
                <div className="flex justify-between font-semibold text-amber-700">
                  <dt>{t('returns.refundedTotal')}</dt>
                  <dd>−{money(s.refundedTotal)}</dd>
                </div>
              ) : null}
              {s.grossProfit !== undefined ? (
                <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-sm text-slate-500">
                  <dt>{t('sale.profit')}</dt>
                  <dd>{money(s.grossProfit)}</dd>
                </div>
              ) : null}
            </dl>
          </Card>

          {s.returns.length ? (
            <Card title={t('returns.title')} className="p-0">
              <ul className="divide-y divide-slate-100">
                {s.returns.map((r) => (
                  <li key={r.id}>
                    <Link href={`/returns/${r.id}`} className="block active:bg-slate-50">
                      <ListRow
                        title={r.displayNumber}
                        subtitle={format.dateTime(new Date(r.date), {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                        trailing={<span className="font-semibold">−{money(r.refundTotal)}</span>}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {can(Permission.RETURNS_CREATE) && s.status !== 'RETURNED' ? (
            <Link
              href={`/sales/${s.id}/return`}
              className="flex min-h-12 items-center justify-center rounded-2xl bg-white font-semibold text-slate-800 ring-1 ring-slate-200 active:bg-slate-50"
            >
              {t('returns.create')}
            </Link>
          ) : null}

          {can(Permission.SALES_CREATE) ? (
            <Link
              href="/sale"
              className="flex min-h-12 items-center justify-center rounded-2xl bg-brand-600 font-semibold text-white active:bg-brand-800"
            >
              {t('sale.newSale')}
            </Link>
          ) : null}
        </>
      ) : null}
    </>
  );
}
