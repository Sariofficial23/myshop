'use client';

import { Permission } from '@myshop/shared';
import { Card } from '@myshop/ui';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarClock,
  ChartColumn,
  ChevronRight,
  PackagePlus,
  ShoppingBag,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { AppIcon, type IconTint } from '@/components/icons/app-icon';
import { installmentsApi } from '@/lib/api/finance';
import { reportsApi } from '@/lib/api/reports';
import { stockApi } from '@/lib/api/stock';
import { useCan, useMe } from '@/lib/auth/auth-provider';
import { useMoney } from '@/lib/hooks/use-money';

function Tile({
  href,
  icon,
  tint,
  children,
}: {
  href: string;
  icon: Parameters<typeof AppIcon>[0]['icon'];
  tint: IconTint;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-24 flex-col justify-between gap-2 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 active:bg-slate-50"
    >
      <AppIcon icon={icon} tint={tint} />
      <span className="text-[15px] font-semibold">{children}</span>
    </Link>
  );
}

export default function HomePage() {
  const t = useTranslations();
  const me = useMe();
  const can = useCan();
  const money = useMoney();
  const today = useQuery({
    queryKey: ['reports', 'sales', 'today'],
    queryFn: () => reportsApi.sales(),
    enabled: can(Permission.SALES_VIEW),
  });
  const low = useQuery({
    queryKey: ['stock', { lowOnly: true }],
    queryFn: () => stockApi.balances({ lowOnly: true }),
    enabled: can(Permission.STOCK_VIEW),
  });
  const overdue = useQuery({
    queryKey: ['installments', 'overdue'],
    queryFn: () => installmentsApi.list({ status: 'ACTIVE', overdue: true }),
    enabled: can(Permission.SALES_VIEW),
  });

  return (
    <>
      <header>
        <p className="text-sm font-medium text-[#8e8e93]">
          {t('home.roleIn', { role: t(`roles.${me.role}`), company: me.company.name })}
        </p>
        <h1 className="text-[28px] leading-tight font-bold">
          {t('home.greeting', { name: me.user.firstName })}
        </h1>
      </header>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[2fr_1fr]">
        {today.data ? (
          <Link href="/reports" className="block active:opacity-80">
            <Card>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-[#8e8e93] uppercase">{t('home.today')}</p>
                <ChevronRight aria-hidden size={20} className="text-[#c7c7cc]" />
              </div>
              <p className="mt-1 text-[34px] leading-tight font-bold tracking-tight">
                {money(today.data.revenue)}
              </p>
              <p className="text-[15px] text-[#8e8e93]">
                {t('home.todayStats', {
                  sales: today.data.salesCount,
                  items: today.data.itemsSold,
                })}
              </p>
            </Card>
          </Link>
        ) : null}

        {can(Permission.SALES_CREATE) ? (
          <Link
            href="/sale"
            className="flex min-h-16 items-center justify-center gap-3 rounded-2xl lg:rounded-3xl bg-gradient-to-b from-[#1a8cff] to-[#007aff] text-[17px] font-semibold text-white shadow-lg shadow-brand-600/25 active:opacity-90"
          >
            <ShoppingBag aria-hidden size={22} strokeWidth={2.2} />
            {t('home.newSale')}
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {can(Permission.SALES_VIEW) ? (
          <Tile href="/reports" icon={ChartColumn} tint="indigo">
            {t('home.reports')}
          </Tile>
        ) : null}
        {can(Permission.PURCHASES_MANAGE) ? (
          <Tile href="/purchases/new" icon={PackagePlus} tint="green">
            {t('home.newPurchase')}
          </Tile>
        ) : null}
        {can(Permission.STOCK_VIEW) && low.data ? (
          <Tile href="/stock" icon={TriangleAlert} tint={low.data.length ? 'orange' : 'gray'}>
            {t('home.lowStock', { count: low.data.length })}
          </Tile>
        ) : null}
        {overdue.data && overdue.data.total > 0 ? (
          <Tile href="/installments" icon={CalendarClock} tint="red">
            {t('home.overdueInstallments', { count: overdue.data.total })}
          </Tile>
        ) : null}
      </div>
    </>
  );
}
