'use client';

import { Permission } from '@myshop/shared';
import { Card, ListRow } from '@myshop/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { StockTabs } from '@/components/stock/stock-tabs';
import { transfersApi } from '@/lib/api/documents';
import { useCan } from '@/lib/auth/auth-provider';

export default function TransfersPage() {
  const t = useTranslations();
  const format = useFormatter();
  const can = useCan();
  const transfers = useQuery({ queryKey: ['transfers'], queryFn: () => transfersApi.list() });
  return (
    <>
      <StockTabs />
      <PageHeader
        title={t('transfers.title')}
        action={
          can(Permission.TRANSFERS_MANAGE) ? (
            <Link
              href="/transfers/new"
              className="flex min-h-11 items-center rounded-2xl bg-brand-600 px-4 font-semibold text-white active:bg-brand-800"
            >
              + {t('transfers.add')}
            </Link>
          ) : null
        }
      />
      <ErrorMessage error={transfers.error} />
      {transfers.data?.items.length === 0 ? (
        <p className="py-6 text-center text-slate-500">{t('transfers.empty')}</p>
      ) : null}
      {transfers.data?.items.length ? (
        <Card className="p-0">
          <ul className="divide-y divide-slate-100">
            {transfers.data.items.map((d) => (
              <li key={d.id}>
                <Link href={`/transfers/${d.id}`} className="block active:bg-slate-50">
                  <ListRow
                    title={`${d.displayNumber} · ${d.fromBranch.name} → ${d.toBranch.name}`}
                    subtitle={format.dateTime(new Date(d.date), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
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
