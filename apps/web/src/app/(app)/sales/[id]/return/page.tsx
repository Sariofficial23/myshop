'use client';

import { PAYMENT_METHODS, type PaymentMethod } from '@myshop/shared';
import { Button, Card, cn, TextField } from '@myshop/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { returnsApi } from '@/lib/api/documents';
import { type SaleItem, salesApi } from '@/lib/api/sales';
import { useMoney } from '@/lib/hooks/use-money';
import { fromCents } from '@/lib/sales/cart';
import { estimateRefundCents } from '@/lib/sales/refund';

interface Choice {
  quantity: string;
  serials: string[];
}

const available = (item: SaleItem) => item.quantity - item.returnedQuantity;

function chosenQuantity(item: SaleItem, choice: Choice | undefined): number {
  if (!choice) return 0;
  if (item.variant.product.serialType) return choice.serials.length;
  const qty = Number(choice.quantity);
  return Number.isInteger(qty) && qty > 0 ? qty : 0;
}

/** Возврат по чеку: выбор товаров/IMEI, способ выплаты, причина. */
export default function SaleReturnPage() {
  const t = useTranslations();
  const money = useMoney();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const sale = useQuery({ queryKey: ['sales', id], queryFn: () => salesApi.get(id) });
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [reason, setReason] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const items = sale.data?.items.filter((item) => available(item) > 0) ?? [];
  const set = (itemId: string, patch: Partial<Choice>) =>
    setChoices((cur) => ({
      ...cur,
      [itemId]: {
        quantity: cur[itemId]?.quantity ?? '',
        serials: cur[itemId]?.serials ?? [],
        ...patch,
      },
    }));
  const selected = items
    .map((item) => ({ item, qty: chosenQuantity(item, choices[item.id]) }))
    .filter(({ item, qty }) => qty > 0 && qty <= available(item));
  const overLimit = items.some((item) => chosenQuantity(item, choices[item.id]) > available(item));
  const refund = selected.reduce((sum, { item, qty }) => sum + estimateRefundCents(item, qty), 0);

  const submit = useMutation({
    mutationFn: () =>
      returnsApi.create({
        saleId: id,
        refundMethod: method,
        reason: reason.trim() || null,
        items: selected.map(({ item, qty }) =>
          item.variant.product.serialType
            ? { saleItemId: item.id, serialNumbers: choices[item.id]!.serials }
            : { saleItemId: item.id, quantity: qty },
        ),
      }),
    onSuccess: async (created) => {
      await Promise.all(
        ['sales', 'returns', 'stock', 'serials', 'products'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      router.replace(`/returns/${created.id}`);
    },
  });

  return (
    <>
      <PageHeader
        title={
          sale.data ? t('returns.newFor', { number: sale.data.displayNumber }) : t('returns.title')
        }
        backHref={`/sales/${id}`}
        backLabel={t('common.back')}
      />
      <ErrorMessage error={sale.error} />
      {sale.data && items.length === 0 ? (
        <p className="py-6 text-center text-slate-500">{t('returns.nothingLeft')}</p>
      ) : null}
      {items.map((item) => {
        const choice = choices[item.id];
        const sold = item.serialNumbers.filter((s) => s.status === 'SOLD');
        return (
          <Card key={item.id}>
            <p className="font-semibold">
              {item.variant.product.name}
              {item.variant.name ? (
                <span className="font-normal text-slate-500"> · {item.variant.name}</span>
              ) : null}
            </p>
            <p className="mb-3 text-sm text-slate-500">
              {t('returns.soldLine', {
                quantity: item.quantity,
                total: money(item.total),
                left: available(item),
              })}
            </p>
            {item.variant.product.serialType ? (
              <ul className="divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-200">
                {sold.map((serial) => (
                  <li key={serial.id}>
                    <label className="flex min-h-12 cursor-pointer items-center gap-3 px-4">
                      <input
                        type="checkbox"
                        className="size-5 accent-brand-600"
                        checked={choice?.serials.includes(serial.number) ?? false}
                        onChange={(e) =>
                          set(item.id, {
                            serials: e.target.checked
                              ? [...(choice?.serials ?? []), serial.number]
                              : (choice?.serials ?? []).filter((n) => n !== serial.number),
                          })
                        }
                      />
                      <span className="font-mono">{serial.number}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <TextField
                label={t('returns.quantity')}
                type="number"
                min={0}
                max={available(item)}
                inputMode="numeric"
                value={choice?.quantity ?? ''}
                onChange={(e) => set(item.id, { quantity: e.target.value })}
                error={
                  chosenQuantity(item, choice) > available(item)
                    ? t('returns.maxLeft', { count: available(item) })
                    : undefined
                }
              />
            )}
          </Card>
        );
      })}

      {items.length ? (
        <>
          <Card title={t('returns.refundMethod')}>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={method === m}
                  onClick={() => setMethod(m)}
                  className={cn(
                    'min-h-12 rounded-2xl text-sm font-semibold ring-1',
                    method === m
                      ? 'bg-brand-600 text-white ring-brand-600'
                      : 'bg-white text-slate-700 ring-slate-200 active:bg-slate-50',
                  )}
                >
                  {t(`paymentMethod.${m}`)}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <TextField
                label={`${t('returns.reason')} (${t('common.optional')})`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={2000}
              />
            </div>
          </Card>
          <Card>
            <div className="flex justify-between text-xl font-bold">
              <span>{t('returns.toRefund')}</span>
              <span>{money(fromCents(refund))}</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">{t('returns.hint')}</p>
            <div className="mt-3 flex flex-col gap-2">
              <ErrorMessage error={submit.error} />
              {showErrors && (selected.length === 0 || overLimit) ? (
                <p className="text-sm text-red-600">{t('returns.selectItems')}</p>
              ) : null}
              <Button
                block
                disabled={submit.isPending}
                onClick={() => {
                  setShowErrors(true);
                  if (selected.length && !overLimit) submit.mutate();
                }}
              >
                {t('returns.submit')}
              </Button>
            </div>
          </Card>
        </>
      ) : null}
    </>
  );
}
