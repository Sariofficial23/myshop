'use client';

import { Button, Card, StatusBadge } from '@myshop/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { type Purchase, purchasesApi } from '@/lib/api/stock';
import { useMoney } from '@/lib/hooks/use-money';

const fullName = (u: { firstName: string; lastName: string | null }) =>
  [u.firstName, u.lastName].filter(Boolean).join(' ');

export default function PurchasePage() {
  const t = useTranslations();
  const format = useFormatter();
  const money = useMoney();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const purchase = useQuery({ queryKey: ['purchases', id], queryFn: () => purchasesApi.get(id) });

  const onDone = async (updated: Purchase) => {
    queryClient.setQueryData(['purchases', id], updated);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['purchases'] }),
      queryClient.invalidateQueries({ queryKey: ['stock'] }),
      queryClient.invalidateQueries({ queryKey: ['products'] }),
    ]);
  };
  const confirm = useMutation({ mutationFn: () => purchasesApi.confirm(id), onSuccess: onDone });
  const cancel = useMutation({ mutationFn: () => purchasesApi.cancel(id), onSuccess: onDone });
  const p = purchase.data;

  return (
    <>
      <PageHeader
        title={p ? p.displayNumber : t('purchases.title')}
        backHref="/purchases"
        backLabel={t('common.back')}
      />
      <ErrorMessage error={purchase.error} />
      {p ? (
        <>
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1 text-slate-700">
                <p className="text-2xl font-bold text-slate-900">{money(p.total)}</p>
                <p>{format.dateTime(new Date(p.date), { dateStyle: 'long' })}</p>
                <p>
                  {p.branch.name}
                  {p.supplier ? ` · ${p.supplier.name}` : ''}
                  {p.documentNumber ? ` · № ${p.documentNumber}` : ''}
                </p>
                <p className="text-sm text-slate-500">
                  {t('purchases.createdBy', { name: fullName(p.createdBy) })}
                </p>
                {p.confirmedBy ? (
                  <p className="text-sm text-slate-500">
                    {t('purchases.confirmedBy', { name: fullName(p.confirmedBy) })}
                  </p>
                ) : null}
              </div>
              <StatusBadge tone={p.status === 'CONFIRMED' ? 'success' : 'neutral'}>
                {t(`documentStatus.${p.status}`)}
              </StatusBadge>
            </div>
          </Card>

          {p.items.map((item) => (
            <Card key={item.id}>
              <p className="font-semibold">{item.variant.product.name}</p>
              <p className="text-sm text-slate-500">
                {[item.variant.name, item.variant.sku].filter(Boolean).join(' · ')}
              </p>
              <p className="mt-2">
                {t('purchases.lineTotal', {
                  qty: item.quantity,
                  price: money(item.purchasePrice),
                  total: money(item.total),
                })}
              </p>
              {item.salePrice ? (
                <p className="text-sm text-slate-500">
                  {t('purchases.salePrice')}: {money(item.salePrice)}
                </p>
              ) : null}
              {item.serialNumbers.length ? (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {item.serialNumbers.map((number) => (
                    <li
                      key={number}
                      className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-xs"
                    >
                      {number}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ))}

          {p.status === 'DRAFT' ? (
            <Card>
              <p className="text-sm text-slate-500">{t('purchases.confirmHint')}</p>
              <div className="mt-3 flex flex-col gap-2">
                <ErrorMessage error={confirm.error ?? cancel.error} />
                <Button block disabled={confirm.isPending} onClick={() => confirm.mutate()}>
                  {t('purchases.confirm')}
                </Button>
                <Button
                  block
                  variant="danger"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate()}
                >
                  {t('purchases.cancel')}
                </Button>
              </div>
            </Card>
          ) : null}
        </>
      ) : null}
    </>
  );
}
