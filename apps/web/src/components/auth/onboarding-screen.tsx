'use client';

import { Button, Card, TextField } from '@myshop/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { useAuth } from '@/lib/auth/auth-provider';

/** Пользователь Telegram без магазина: показать его ID или создать свой магазин. */
export function OnboardingScreen({ telegramId }: { telegramId?: string }) {
  const t = useTranslations('auth');
  const { register, inTelegram } = useAuth();
  const [companyName, setCompanyName] = useState('');
  const [branchName, setBranchName] = useState('');
  const create = useMutation({ mutationFn: register });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate({ companyName, branchName: branchName.trim() || undefined });
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-6 pb-10">
      <div className="flex justify-end">
        <LocaleSwitcher />
      </div>
      <Card>
        <h1 className="text-2xl font-bold">{t('noMembershipTitle')}</h1>
        <p className="mt-2 text-slate-600">{t('noMembershipHint')}</p>
        {telegramId ? (
          <p className="mt-3 rounded-2xl bg-slate-100 p-3 text-center font-mono text-2xl font-bold select-all">
            {telegramId}
          </p>
        ) : null}
      </Card>

      {inTelegram ? (
        <Card title={t('createShopTitle')}>
          <p className="mb-3 text-sm text-slate-500">{t('createShopHint')}</p>
          <form className="flex flex-col gap-3" onSubmit={onSubmit}>
            <TextField
              label={t('companyName')}
              placeholder={t('companyNamePlaceholder')}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              minLength={2}
              maxLength={200}
            />
            <TextField
              label={t('branchName')}
              placeholder={t('branchNamePlaceholder')}
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              maxLength={200}
            />
            <ErrorMessage error={create.error} />
            <Button type="submit" block disabled={create.isPending}>
              {t('createShop')}
            </Button>
          </form>
        </Card>
      ) : null}
    </main>
  );
}
