'use client';

import { Permission } from '@myshop/shared';
import { Card } from '@myshop/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { SystemStatus } from '@/components/system-status';
import { stockApi } from '@/lib/api/stock';
import { useCan, useMe } from '@/lib/auth/auth-provider';

export default function HomePage() {
  const t = useTranslations();
  const me = useMe();
  const can = useCan();
  const low = useQuery({
    queryKey: ['stock', { lowOnly: true }],
    queryFn: () => stockApi.balances({ lowOnly: true }),
    enabled: can(Permission.STOCK_VIEW),
  });
  return (
    <>
      <header>
        <h1 className="text-2xl font-bold">{t('home.greeting', { name: me.user.firstName })}</h1>
        <p className="text-slate-600">
          {t('home.roleIn', { role: t(`roles.${me.role}`), company: me.company.name })}
        </p>
      </header>

      {can(Permission.SALES_CREATE) ? (
        <Link
          href="/sale"
          className="flex min-h-24 items-center justify-center gap-3 rounded-3xl bg-emerald-600 text-xl font-bold text-white active:bg-emerald-800"
        >
          <span aria-hidden className="text-3xl">
            🛒
          </span>
          + {t('home.newSale')}
        </Link>
      ) : null}

      {can(Permission.PURCHASES_MANAGE) || can(Permission.STOCK_VIEW) ? (
        <div className="grid grid-cols-2 gap-3">
          {can(Permission.PURCHASES_MANAGE) ? (
            <Link
              href="/purchases/new"
              className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-3xl bg-brand-600 font-semibold text-white active:bg-brand-800"
            >
              <span aria-hidden className="text-2xl">
                📥
              </span>
              + {t('home.newPurchase')}
            </Link>
          ) : null}
          {can(Permission.STOCK_VIEW) && low.data ? (
            <Link
              href="/stock"
              className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-3xl bg-white font-semibold ring-1 ring-slate-200 active:bg-slate-50"
            >
              <span aria-hidden className="text-2xl">
                ⚠️
              </span>
              <span className={low.data.length ? 'text-red-600' : 'text-slate-700'}>
                {t('home.lowStock', { count: low.data.length })}
              </span>
            </Link>
          ) : null}
        </div>
      ) : null}

      <Card title={me.allBranches ? t('home.allBranches') : t('home.yourBranches')}>
        <ul className="flex flex-wrap gap-2">
          {me.branches.map((branch) => (
            <li
              key={branch.id}
              className="rounded-full bg-brand-50 px-3 py-1.5 text-sm text-brand-800"
            >
              {branch.name}
            </li>
          ))}
        </ul>
      </Card>

      <p className="rounded-2xl bg-brand-50 p-4 text-sm text-brand-800">{t('home.stageNotice')}</p>

      <SystemStatus />
    </>
  );
}
