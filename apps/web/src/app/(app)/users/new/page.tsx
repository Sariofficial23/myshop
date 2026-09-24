'use client';

import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/page-header';
import { UserForm } from '@/components/users/user-form';

export default function NewUserPage() {
  const t = useTranslations();
  return (
    <>
      <PageHeader title={t('users.new')} backHref="/users" backLabel={t('common.back')} />
      <UserForm />
    </>
  );
}
