'use client';

import { Permission } from '@myshop/shared';
import { Card } from '@myshop/ui';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { DocItemsCard, personName } from '@/components/stock/doc-items-card';
import { writeOffsApi } from '@/lib/api/documents';
import { useCan } from '@/lib/auth/auth-provider';
import { useMoney } from '@/lib/hooks/use-money';

export default function WriteOffPage() {
  const t = useTranslations();
  const format = useFormatter();
  const money = useMoney();
  const can = useCan();
  const { id } = useParams<{ id: string }>();
  const writeOff = useQuery({ queryKey: ['write-offs', id], queryFn: () => writeOffsApi.get(id) });
  const d = writeOff.data;
  return (
    <>
      <PageHeader
        title={d ? d.displayNumber : t('writeOffs.title')}
        backHref="/write-offs"
        backLabel={t('common.back')}
      />
      <ErrorMessage error={writeOff.error} />
      {d ? (
        <>
          <Card>
            <div className="flex flex-col gap-1 text-slate-700">
              <p className="text-xl font-bold text-slate-900">{t(`writeOffReason.${d.reason}`)}</p>
              <p>{format.dateTime(new Date(d.date), { dateStyle: 'long', timeStyle: 'short' })}</p>
              <p>{d.branch.name}</p>
              {can(Permission.REPORTS_VIEW) ? (
                <p>{t('writeOffs.cost', { value: money(d.costTotal) })}</p>
              ) : null}
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
