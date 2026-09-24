'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { UserForm } from '@/components/users/user-form';
import { usersApi } from '@/lib/api/company';

export default function EditUserPage() {
  const t = useTranslations();
  const { id } = useParams<{ id: string }>();
  const user = useQuery({ queryKey: ['users', id], queryFn: () => usersApi.get(id) });
  return (
    <>
      <PageHeader title={t('users.editTitle')} backHref="/users" backLabel={t('common.back')} />
      <ErrorMessage error={user.error} />
      {user.data ? <UserForm user={user.data} /> : null}
    </>
  );
}
