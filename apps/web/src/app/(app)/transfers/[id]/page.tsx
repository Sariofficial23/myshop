'use client';

import { Card } from '@myshop/ui';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { DocItemsCard, personName } from '@/components/stock/doc-items-card';
import { transfersApi } from '@/lib/api/documents';

export default function TransferPage() {
  const t = useTranslations();
  const format = useFormatter();
  const { id } = useParams<{ id: string }>();
  const transfer = useQuery({ queryKey: ['transfers', id], queryFn: () => transfersApi.get(id) });
  const d = transfer.data;
  return (
    <>
      <PageHeader
        title={d ? d.displayNumber : t('transfers.title')}
        backHref="/transfers"
        backLabel={t('common.back')}
      />
      <ErrorMessage error={transfer.error} />
      {d ? (
        <>
          <Card>
            <div className="flex flex-col gap-1 text-slate-700">
              <p className="text-xl font-bold text-slate-900">
                {d.fromBranch.name} → {d.toBranch.name}
              </p>
              <p>{format.dateTime(new Date(d.date), { dateStyle: 'long', timeStyle: 'short' })}</p>
              <p className="text-sm text-slate-500">
                {t('stockDocs.createdBy', { name: personName(d.createdBy) })}
              </p>
              {d.notes ? <p className="text-sm">{d.notes}</p> : null}
            </div>
          </Card>
          <DocItemsCard items={d.items} />
        </>
      ) : null}
    </>
  );
}
