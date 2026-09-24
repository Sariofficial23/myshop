'use client';

import { Permission } from '@myshop/shared';
import { Button, Card, ListRow, SelectField } from '@myshop/ui';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ErrorMessage } from '@/components/error-message';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { PageHeader } from '@/components/page-header';
import { useAuth, useCan, useMe } from '@/lib/auth/auth-provider';

export default function MorePage() {
  const t = useTranslations();
  const me = useMe();
  const can = useCan();
  const { logout, switchCompany } = useAuth();
  const switcher = useMutation({ mutationFn: switchCompany });

  const links = [
    { href: '/company', icon: '🏢', label: t('more.company'), visible: true },
    {
      href: '/branches',
      icon: '🏬',
      label: t('more.branches'),
      visible: can(Permission.BRANCHES_VIEW),
    },
    { href: '/users', icon: '👥', label: t('more.users'), visible: can(Permission.USERS_VIEW) },
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
                  leading={<span className="text-xl">{link.icon}</span>}
                  title={link.label}
                  trailing="›"
                />
              </Link>
            </li>
          ))}
          <li>
            <ListRow
              leading={<span className="text-xl">🌐</span>}
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
