'use client';

import { PAYMENT_METHODS } from '@myshop/shared';
import { Card, cn } from '@myshop/ui';
import { useQuery } from '@tanstack/react-query';
import { Banknote, CreditCard, Landmark } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { AppIcon } from '@/components/icons/app-icon';
import { PageHeader } from '@/components/page-header';
import { BranchFilter } from '@/components/stock/branch-filter';
import { reportsApi } from '@/lib/api/reports';
import { useMoney } from '@/lib/hooks/use-money';
import { type Period, PERIODS, periodRange } from '@/lib/reports/period';

const METHOD_ICONS = {
  CASH: { icon: Banknote, tint: 'green' },
  CARD: { icon: CreditCard, tint: 'blue' },
  TRANSFER: { icon: Landmark, tint: 'purple' },
} as const;

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[13px] text-[#8e8e93]">{label}</p>
      <p className={cn('text-[20px] font-semibold tracking-tight', tone)}>{value}</p>
    </div>
  );
}

/** Отчёт о продажах: за сегодня, вчера, неделю или месяц — сколько продано, чем оплачено, что продано. */
export default function ReportsPage() {
  const t = useTranslations();
  const money = useMoney();
  const [period, setPeriod] = useState<Period>('today');
  const [branchId, setBranchId] = useState('');
  const range = periodRange(period, new Date());
  const report = useQuery({
    queryKey: ['reports', 'sales', period, branchId, range.from],
    queryFn: () => reportsApi.sales({ ...range, branchId: branchId || undefined }),
  });
  const r = report.data;

  return (
    <>
      <PageHeader title={t('reports.title')} />
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-[#e3e3e8] p-0.5">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={period === p}
            onClick={() => setPeriod(p)}
            className={cn(
              'min-h-9 rounded-[10px] text-[13px] font-semibold',
              period === p ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600',
            )}
          >
            {t(`reports.period_${p}`)}
          </button>
        ))}
      </div>
      <BranchFilter value={branchId} onChange={setBranchId} />
      <ErrorMessage error={report.error} />

      {r ? (
        <>
          <Card>
            <p className="text-[13px] font-semibold text-[#8e8e93] uppercase">
              {t('reports.revenue')}
            </p>
            <p className="text-[34px] leading-tight font-bold tracking-tight">{money(r.revenue)}</p>
            {Number(r.returns) > 0 ? (
              <p className="text-[15px] text-[#8e8e93]">
                {t('reports.net', { value: money(r.netRevenue) })}
              </p>
            ) : null}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Stat label={t('reports.salesCount')} value={String(r.salesCount)} />
              <Stat label={t('reports.itemsSold')} value={String(r.itemsSold)} />
              <Stat label={t('reports.averageCheck')} value={money(r.averageCheck)} />
              {r.grossProfit !== undefined ? (
                <Stat
                  label={t('reports.profit')}
                  value={money(r.grossProfit)}
                  tone="text-[#28b446]"
                />
              ) : null}
              {Number(r.returns) > 0 ? (
                <Stat
                  label={t('reports.returns', { count: r.returnsCount })}
                  value={`−${money(r.returns)}`}
                  tone="text-[#ff3b30]"
                />
              ) : null}
              {Number(r.discount) > 0 ? (
                <Stat label={t('reports.discounts')} value={money(r.discount)} />
              ) : null}
            </div>
          </Card>

          <Card title={t('reports.money')} className="p-0 pt-4">
            <ul className="divide-y divide-slate-100">
              {PAYMENT_METHODS.map((m) => (
                <li key={m} className="flex items-center gap-3 px-4 py-3">
                  <AppIcon icon={METHOD_ICONS[m].icon} tint={METHOD_ICONS[m].tint} size="sm" />
                  <span className="flex-1">{t(`paymentMethod.${m}`)}</span>
                  <span className="font-semibold">{money(r.money[m])}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title={t('reports.items')} className="p-0 pt-4">
            {r.items.length ? (
              <ul className="divide-y divide-slate-100">
                {r.items.map((item) => (
                  <li key={item.variantId} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {item.product}
                        {item.variant ? (
                          <span className="font-normal text-[#8e8e93]"> · {item.variant}</span>
                        ) : null}
                      </span>
                      <span className="block text-[13px] text-[#8e8e93]">
                        {t('reports.sold', { count: item.quantity })}
                        {item.profit !== undefined
                          ? ` · ${t('reports.itemProfit', { value: money(item.profit) })}`
                          : ''}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold">{money(item.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 pb-4 text-[#8e8e93]">{t('reports.noSales')}</p>
            )}
          </Card>

          {r.sellers.length ? (
            <Card title={t('reports.sellers')} className="p-0 pt-4">
              <ul className="divide-y divide-slate-100">
                {r.sellers.map((s) => (
                  <li key={s.id} className="flex items-center justify-between px-4 py-3">
                    <span>
                      <span className="block font-medium">{s.name}</span>
                      <span className="block text-[13px] text-[#8e8e93]">
                        {t('reports.salesShort', { count: s.salesCount })}
                      </span>
                    </span>
                    <span className="font-semibold">{money(s.revenue)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : null}
    </>
  );
}
