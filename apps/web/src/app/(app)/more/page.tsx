'use client';

import { Permission } from '@myshop/shared';
import { Button, Card, ListRow, SelectField } from '@myshop/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Building2,
  CalendarClock,
  Contact,
  Globe,
  ShieldCheck,
  ShieldUser,
  Store,
  Tags,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ErrorMessage } from '@/components/error-message';
import { AppIcon, type IconTint } from '@/components/icons/app-icon';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { PageHeader } from '@/components/page-header';
import { adminApi } from '@/lib/api/admin';
import { useAuth, useCan, useMe } from '@/lib/auth/auth-provider';

export default function MorePage() {
  const t = useTranslations();
  const me = useMe();
  const can = useCan();
  const { logout, switchCompany, inTelegram } = useAuth();
  const isAdmin = useQuery({
    queryKey: ['admin', 'me'],
    queryFn: adminApi.me,
    enabled: inTelegram,
    retry: false,
  });
  const switcher = useMutation({ mutationFn: switchCompany });

  const links = [
    {
      href: '/company',
      icon: Building2,
      tint: 'gray' as IconTint,
      label: t('more.company'),
      visible: true,
    },
    {
      href: '/branches',
      icon: Store,
      tint: 'blue' as IconTint,
      label: t('more.branches'),
      visible: can(Permission.BRANCHES_VIEW),
    },
    {
      href: '/users',
      icon: Users,
      tint: 'indigo' as IconTint,
      label: t('more.users'),
      visible: can(Permission.USERS_VIEW),
    },
    {
      href: '/cash',
      icon: Wallet,
      tint: 'green' as IconTint,
      label: t('more.cash'),
      visible: can(Permission.CASH_MANAGE),
    },
    {
      href: '/installments',
      icon: CalendarClock,
      tint: 'orange' as IconTint,
      label: t('more.installments'),
      visible: can(Permission.SALES_VIEW),
    },
    {
      href: '/warranty',
      icon: ShieldCheck,
      tint: 'teal' as IconTint,
      label: t('more.warranty'),
      visible: can(Permission.SALES_VIEW),
    },
    {
      href: '/customers',
      icon: Contact,
      tint: 'pink' as IconTint,
      label: t('more.customers'),
      visible: can(Permission.CUSTOMERS_MANAGE),
    },
    {
      href: '/suppliers',
      icon: Truck,
      tint: 'purple' as IconTint,
      label: t('more.suppliers'),
      visible: can(Permission.SUPPLIERS_MANAGE),
    },
    {
      href: '/catalog',
      icon: Tags,
      tint: 'yellow' as IconTint,
      label: t('more.catalog'),
      visible: can(Permission.PRODUCTS_VIEW),
    },
    {
      href: '/admin',
      icon: ShieldUser,
      tint: 'indigo' as IconTint,
      label: t('admin.title'),
      visible: Boolean(isAdmin.data),
    },
  ].filter((link) => link.visible);

  return (
    <>
      <PageHeader title={t('more.title')} />

      <Card>
        <p className="text-lg font-semibold">
          {[me.user.firstName, me.user.lastName].filter(Boolean).join(' ')}
        </p>
        <p className="text-slate-600">
          {t(`roles.${me.role}`)} · {me.company.name}
        </p>
        {me.user.telegramId ? (
          <p className="mt-1 text-sm text-slate-500">
            {t('more.telegramId', { id: me.user.telegramId })}
          </p>
        ) : null}
      </Card>

      {me.memberships.length > 1 ? (
        <Card>
          <SelectField
            label={t('auth.switchCompany')}
            value={me.company.id}
            disabled={switcher.isPending}
            onChange={(e) => switcher.mutate(e.target.value)}
            options={me.memberships.map((m) => ({
              value: m.companyId,
              label: `${m.companyName} · ${t(`roles.${m.role}`)}`,
            }))}
          />
          <ErrorMessage error={switcher.error} />
        </Card>
      ) : null}

      <Card className="p-0">
        <ul className="divide-y divide-slate-100">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="block rounded-3xl active:bg-slate-50">
                <ListRow
                  leading={<AppIcon icon={link.icon} tint={link.tint} size="sm" />}
                  title={link.label}
                  trailing="›"
                />
              </Link>
            </li>
          ))}
          <li>
            <ListRow
              leading={<AppIcon icon={Globe} tint="blue" size="sm" />}
              title={t('more.language')}
              trailing={<LocaleSwitcher />}
            />
          </li>
        </ul>
      </Card>

      <Button variant="secondary" block onClick={() => void logout()}>
        {t('auth.logout')}
      </Button>
    </>
  );
}
