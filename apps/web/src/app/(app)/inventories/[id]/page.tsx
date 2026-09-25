'use client';

import { Button, Card, cn, StatusBadge } from '@myshop/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { personName } from '@/components/stock/doc-items-card';
import { type Inventory, inventoriesApi } from '@/lib/api/documents';

export default function InventoryPage() {
  const t = useTranslations();
  const format = useFormatter();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const inventory = useQuery({
    queryKey: ['inventories', id],
    queryFn: () => inventoriesApi.get(id),
  });
  const onDone = async (updated: Inventory) => {
    queryClient.setQueryData(['inventories', id], updated);
    await Promise.all(
      ['inventories', 'stock', 'serials', 'products'].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
  };
  const confirm = useMutation({ mutationFn: () => inventoriesApi.confirm(id), onSuccess: onDone });
  const cancel = useMutation({ mutationFn: () => inventoriesApi.cancel(id), onSuccess: onDone });
  const d = inventory.data;
  const draft = d?.status === 'DRAFT';
  const withDifference = d?.items.filter((item) => item.difference !== 0).length ?? 0;

  return (
    <>
      <PageHeader
        title={d ? d.displayNumber : t('inventories.title')}
        backHref="/inventories"
        backLabel={t('common.back')}
      />
      <ErrorMessage error={inventory.error} />
      {d ? (
        <>
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1 text-slate-700">
                <p className="text-xl font-bold text-slate-900">{d.branch.name}</p>
                <p>
                  {format.dateTime(new Date(d.confirmedAt ?? d.createdAt), {
                    dateStyle: 'long',
                    timeStyle: 'short',
                  })}
                </p>
                <p className="text-sm text-slate-500">
                  {t('stockDocs.createdBy', { name: personName(d.createdBy) })}
                </p>
                {d.confirmedBy ? (
                  <p className="text-sm text-slate-500">
                    {t('inventories.confirmedBy', { name: personName(d.confirmedBy) })}
                  </p>
                ) : null}
                {d.notes ? <p className="text-sm">{d.notes}</p> : null}
              </div>
              <StatusBadge tone={d.status === 'CONFIRMED' ? 'success' : 'neutral'}>
                {t(`documentStatus.${d.status}`)}
              </StatusBadge>
            </div>
            <p
              className={cn(
                'mt-3 font-semibold',
                withDifference ? 'text-amber-700' : 'text-emerald-700',
              )}
            >
              {withDifference
                ? t('inventories.differences', { count: withDifference })
                : t('inventories.noDifferences')}
            </p>
          </Card>

          <Card title={t('inventories.counted')} className="p-0">
            <ul className="divide-y divide-slate-100">
              {d.items.map((item) => (
                <li key={item.id} className="flex flex-col gap-1 px-4 py-3">
                  <p className="font-semibold">
                    {item.variant.product.name}
                    {item.variant.name ? (
                      <span className="font-normal text-slate-500"> · {item.variant.name}</span>
                    ) : null}
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="text-slate-500">
                      {t('inventories.expected', { count: item.expectedQuantity })}
                    </span>
                    <span className="text-slate-500">
                      {t('inventories.actualShort', { count: item.countedQuantity })}
                    </span>
                    <span
                      className={cn(
                        'text-right font-bold',
                        item.difference < 0 && 'text-red-600',
                        item.difference > 0 && 'text-emerald-700',
                      )}
                    >
                      {item.difference > 0 ? `+${item.difference}` : item.difference}
                    </span>
                  </div>
                  {item.missingSerials.length ? (
                    <p className="text-sm text-red-600">
                      {t(draft ? 'inventories.missingSerials' : 'inventories.writtenOffSerials', {
                        list: item.missingSerials.join(', '),
                      })}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>

          {draft ? (
            <Card>
              <p className="text-sm text-slate-500">{t('inventories.confirmHint')}</p>
              <div className="mt-3 flex flex-col gap-2">
                <ErrorMessage error={confirm.error ?? cancel.error} />
                <Button
                  block
                  disabled={confirm.isPending || cancel.isPending}
                  onClick={() => confirm.mutate()}
                >
                  {t('inventories.confirm')}
                </Button>
                <Button
                  block
                  variant="secondary"
                  disabled={confirm.isPending || cancel.isPending}
                  onClick={() => cancel.mutate()}
                >
                  {t('inventories.cancel')}
                </Button>
              </div>
            </Card>
          ) : null}
        </>
      ) : null}
    </>
  );
}
