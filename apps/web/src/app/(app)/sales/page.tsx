'use client';

import { Permission } from '@myshop/shared';
import { Button, Card, ListRow } from '@myshop/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { BranchFilter } from '@/components/stock/branch-filter';
import { salesApi } from '@/lib/api/sales';
import { useCan } from '@/lib/auth/auth-provider';
import { useMoney } from '@/lib/hooks/use-money';

export default function SalesPage() {
  const t = useTranslations();
  const format = useFormatter();
  const money = useMoney();
  const can = useCan();
  const [branchId, setBranchId] = useState('');
  const sales = useInfiniteQuery({
    queryKey: ['sales', { branchId }],
    queryFn: ({ pageParam }) => salesApi.list({ branchId, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
  });
  const items = sales.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <PageHeader
        title={t('sales.title')}
        action={
          can(Permission.SALES_CREATE) ? (
            <Link
              href="/sale"
              className="flex min-h-11 items-center rounded-2xl bg-brand-600 px-4 font-semibold text-white active:bg-brand-800"
            >
              + {t('sales.add')}
            </Link>
          ) : null
        }
      />
      <BranchFilter value={branchId} onChange={setBranchId} />
      <ErrorMessage error={sales.error} />
      {sales.data && items.length === 0 ? (
        <p className="py-6 text-center text-slate-500">{t('sales.empty')}</p>
      ) : null}
      {items.length ? (
        <Card className="p-0">
          <ul className="divide-y divide-slate-100">
            {items.map((sale) => (
              <li key={sale.id}>
                <Link href={`/sales/${sale.id}`} className="block active:bg-slate-50">
                  <ListRow
                    title={`${sale.displayNumber} · ${money(sale.total)}`}
                    subtitle={[
                      format.dateTime(new Date(sale.date), {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }),
                      sale.branch.name,
                      sale.customer?.name,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    trailing={
                      <span className="text-sm text-slate-500">
                        {t(`paymentMethod.${sale.paymentType}`)}
                      </span>
                    }
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {sales.hasNextPage ? (
        <Button
          variant="secondary"
          block
          disabled={sales.isFetchingNextPage}
          onClick={() => void sales.fetchNextPage()}
        >
          {t('common.loadMore')}
        </Button>
      ) : null}
    </>
  );
}
