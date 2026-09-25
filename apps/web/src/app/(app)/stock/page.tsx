'use client';

import { Card, CheckboxField, ListRow, StatusBadge } from '@myshop/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { BranchFilter } from '@/components/stock/branch-filter';
import { StockTabs } from '@/components/stock/stock-tabs';
import { stockApi } from '@/lib/api/stock';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { useMoney } from '@/lib/hooks/use-money';

export default function StockPage() {
  const t = useTranslations();
  const money = useMoney();
  const [branchId, setBranchId] = useState('');
  const [q, setQ] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const search = useDebouncedValue(q.trim());
  const stock = useQuery({
    queryKey: ['stock', { branchId, search, lowOnly }],
    queryFn: () =>
      stockApi.balances({ branchId: branchId || undefined, q: search || undefined, lowOnly }),
    placeholderData: keepPreviousData,
  });
  const totalValue = stock.data?.reduce((sum, row) => sum + Number(row.stockValue), 0) ?? 0;

  return (
    <>
      <StockTabs />
      <PageHeader title={t('stock.title')} />
      <BranchFilter value={branchId} onChange={setBranchId} />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('stock.searchPlaceholder')}
        aria-label={t('stock.searchPlaceholder')}
        className="min-h-12 rounded-2xl bg-white px-4 text-base ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-brand-600"
      />
      <CheckboxField
        label={t('stock.lowOnly')}
        checked={lowOnly}
        onChange={(e) => setLowOnly(e.target.checked)}
      />
      <ErrorMessage error={stock.error} />

      {stock.data && stock.data.length > 0 ? (
        <>
          <p className="text-sm text-slate-600">
            {t('stock.totalValue', { value: money(totalValue.toFixed(2)) })}
          </p>
          <Card className="p-0">
            <ul className="divide-y divide-slate-100">
              {stock.data.map((row) => (
                <li key={`${row.branch.id}-${row.variant.id}`}>
                  <Link href={`/products/${row.product.id}`} className="block active:bg-slate-50">
                    <ListRow
                      title={[row.product.name, row.variant.name].filter(Boolean).join(' ')}
                      subtitle={`${row.branch.name} · ${t('stock.value', { value: money(row.avgCost) })}`}
                      trailing={
                        <span className="flex flex-col items-end gap-1">
                          <span
                            className={
                              row.low
                                ? 'text-lg font-bold text-red-600'
                                : 'text-lg font-bold text-slate-900'
                            }
                          >
                            {row.quantity}
                          </span>
                          {row.low ? (
                            <StatusBadge tone="danger">{t('stock.low')}</StatusBadge>
                          ) : null}
                        </span>
                      }
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : stock.data ? (
        <p className="py-6 text-center text-slate-500">{t('stock.empty')}</p>
      ) : null}
    </>
  );
}
