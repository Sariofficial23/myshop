'use client';

import { Permission } from '@myshop/shared';
import { Card, ListRow, StatusBadge } from '@myshop/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { usersApi } from '@/lib/api/company';
import { useCan, useMe } from '@/lib/auth/auth-provider';

export default function UsersPage() {
  const t = useTranslations();
  const me = useMe();
  const canManage = useCan()(Permission.USERS_MANAGE);
  const users = useQuery({ queryKey: ['users'], queryFn: usersApi.list });

  return (
    <>
      <PageHeader title={t('users.title')} backHref="/more" backLabel={t('common.back')} />

      {canManage ? (
        <Link
          href="/users/new"
          className="flex min-h-12 items-center justify-center rounded-2xl bg-brand-600 px-5 font-semibold text-white active:bg-brand-800"
        >
          + {t('users.add')}
        </Link>
      ) : null}

      <ErrorMessage error={users.error} />
      {users.data?.length === 0 ? (
        <p className="text-center text-slate-500">{t('users.empty')}</p>
      ) : null}

      {users.data?.length ? (
        <Card className="p-0">
          <ul className="divide-y divide-slate-100">
            {users.data.map((user) => {
              const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
              const branches = user.allBranches
                ? t('users.allBranches')
                : user.branches.map((b) => b.name).join(', ');
              return (
                <li key={user.id}>
                  <Link href={`/users/${user.id}`} className="block active:bg-slate-50">
                    <ListRow
                      title={user.id === me.user.id ? `${name} (${t('users.you')})` : name}
                      subtitle={`${t(`roles.${user.role}`)} · ${branches}`}
                      trailing={
                        user.isActive ? (
                          '›'
                        ) : (
                          <StatusBadge tone="neutral">{t('common.inactive')}</StatusBadge>
                        )
                      }
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
