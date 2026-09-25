'use client';

import { Permission } from '@myshop/shared';
import { Card, ListRow } from '@myshop/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { StockTabs } from '@/components/stock/stock-tabs';
import { writeOffsApi } from '@/lib/api/documents';
import { useCan } from '@/lib/auth/auth-provider';

export default function WriteOffsPage() {
  const t = useTranslations();
  const format = useFormatter();
  const can = useCan();
  const writeOffs = useQuery({ queryKey: ['write-offs'], queryFn: () => writeOffsApi.list() });
  return (
    <>
      <StockTabs />
      <PageHeader
        title={t('writeOffs.title')}
        action={
          can(Permission.WRITE_OFFS_MANAGE) ? (
            <Link
              href="/write-offs/new"
              className="flex min-h-11 items-center rounded-2xl bg-brand-600 px-4 font-semibold text-white active:bg-brand-800"
            >
              + {t('writeOffs.add')}
            </Link>
          ) : null
        }
      />
      <ErrorMessage error={writeOffs.error} />
      {writeOffs.data?.items.length === 0 ? (
        <p className="py-6 text-center text-slate-500">{t('writeOffs.empty')}</p>
      ) : null}
      {writeOffs.data?.items.length ? (
        <Card className="p-0">
          <ul className="divide-y divide-slate-100">
            {writeOffs.data.items.map((d) => (
              <li key={d.id}>
                <Link href={`/write-offs/${d.id}`} className="block active:bg-slate-50">
                  <ListRow
                    title={`${d.displayNumber} · ${t(`writeOffReason.${d.reason}`)}`}
                    subtitle={[
                      format.dateTime(new Date(d.date), { dateStyle: 'medium' }),
                      d.branch.name,
                    ].join(' · ')}
                    trailing={
                      <span className="text-sm text-slate-500">
                        {t('stockDocs.pcs', {
                          count: d.items.reduce((sum, item) => sum + item.quantity, 0),
                        })}
                      </span>
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
