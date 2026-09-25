'use client';

import type { SubscriptionState } from '@myshop/shared';
import { Button, Card, cn, StatusBadge } from '@myshop/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { AppIcon } from '@/components/icons/app-icon';
import { adminApi, type PlatformCompany } from '@/lib/api/admin';
import { getTelegramInitData } from '@/lib/telegram/web-app';

const FILTERS = ['all', 'PENDING', 'ACTIVE', 'EXPIRED', 'BLOCKED'] as const;
type Filter = (typeof FILTERS)[number];

const TONE: Record<SubscriptionState, 'success' | 'danger' | 'neutral'> = {
  ACTIVE: 'success',
  PENDING: 'neutral',
  EXPIRED: 'danger',
  BLOCKED: 'danger',
};

/** Админ-панель владельца платформы: компании, активация, продление подписки, блокировка. */
export default function AdminPage() {
  const t = useTranslations('admin');
  const [inTelegram] = useState(
    () => typeof window !== 'undefined' && getTelegramInitData() !== '',
  );
  const [filter, setFilter] = useState<Filter>('all');
  const me = useQuery({
    queryKey: ['admin', 'me'],
    queryFn: adminApi.me,
    enabled: inTelegram,
    retry: false,
  });
  const companies = useQuery({
    queryKey: ['admin', 'companies'],
    queryFn: adminApi.companies,
    enabled: Boolean(me.data),
  });
  const list = (companies.data ?? []).filter((c) => filter === 'all' || c.state === filter);
  const count = (f: Filter) =>
    (companies.data ?? []).filter((c) => f === 'all' || c.state === f).length;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-6 pb-10">
      <header className="flex items-center gap-3">
        <AppIcon icon={ShieldCheck} tint="indigo" />
        <div className="flex-1">
          <h1 className="text-[28px] leading-tight font-bold">{t('title')}</h1>
          {me.data ? <p className="text-[13px] text-[#8e8e93]">{me.data.firstName}</p> : null}
        </div>
        <Link href="/" className="text-[15px] font-semibold text-brand-600">
          MyShop
        </Link>
      </header>

      {!inTelegram ? <Card>{t('openInTelegram')}</Card> : null}
      <ErrorMessage error={me.error ?? companies.error} />

      {companies.data ? (
        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                'min-h-9 shrink-0 rounded-full px-4 text-[13px] font-semibold whitespace-nowrap',
                filter === f
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200',
              )}
            >
              {t(`filter_${f}`)} · {count(f)}
            </button>
          ))}
        </nav>
      ) : null}

      {companies.data && list.length === 0 ? (
        <p className="py-6 text-center text-[#8e8e93]">{t('empty')}</p>
      ) : null}
      {list.map((company) => (
        <CompanyCard key={company.id} company={company} />
      ))}
    </main>
  );
}

function CompanyCard({ company }: { company: PlatformCompany }) {
  const t = useTranslations('admin');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const onDone = () => queryClient.invalidateQueries({ queryKey: ['admin', 'companies'] });
  const extend = useMutation({
    mutationFn: (months: number) => adminApi.extend(company.id, months),
    onSuccess: onDone,
  });
  const block = useMutation({ mutationFn: () => adminApi.block(company.id), onSuccess: onDone });
  const unblock = useMutation({
    mutationFn: () => adminApi.unblock(company.id),
    onSuccess: onDone,
  });
  const busy = extend.isPending || block.isPending || unblock.isPending;
  const date = (value: string) => format.dateTime(new Date(value), { dateStyle: 'medium' });

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[17px] font-semibold">{company.name}</p>
          {company.owner ? (
            <p className="truncate text-[13px] text-[#8e8e93]">
              {[
                company.owner.name,
                company.owner.email,
                company.owner.username ? `@${company.owner.username}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
        </div>
        <StatusBadge tone={TONE[company.state]}>{t(`state_${company.state}`)}</StatusBadge>
      </div>
      <p className="mt-2 text-[15px]">
        {company.paidUntil
          ? t('paidUntil', { date: date(company.paidUntil) })
          : company.status === 'ACTIVE'
            ? t('unlimited')
            : t('notPaid')}
      </p>
      <p className="text-[13px] text-[#8e8e93]">
        {t('stats', {
          date: date(company.createdAt),
          users: company.usersCount,
          branches: company.branchesCount,
          sales: company.salesCount,
        })}
      </p>
      <ErrorMessage error={extend.error ?? block.error ?? unblock.error} />
      {company.status === 'PENDING' ? (
        <Button block className="mt-3" disabled={busy} onClick={() => extend.mutate(1)}>
          {t('activateMonth')}
        </Button>
      ) : null}
      {company.status !== 'BLOCKED' ? (
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[1, 3, 12].map((months) => (
            <Button
              key={months}
              variant="secondary"
              disabled={busy}
              onClick={() => extend.mutate(months)}
              className="px-2 text-[15px] whitespace-nowrap"
            >
              {t('plusMonths', { months })}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="mt-2">
        {company.status === 'BLOCKED' ? (
          <Button block disabled={busy} onClick={() => unblock.mutate()}>
            {t('unblock')}
          </Button>
        ) : (
          <Button
            block
            variant="danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm(t('blockConfirm', { name: company.name }))) block.mutate();
            }}
          >
            {t('block')}
          </Button>
        )}
      </div>
    </Card>
  );
}
