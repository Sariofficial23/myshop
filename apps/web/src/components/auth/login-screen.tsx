'use client';

import { Button, Card } from '@myshop/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ErrorMessage } from '@/components/error-message';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { SystemStatus } from '@/components/system-status';
import { authApi } from '@/lib/api/auth';
import { useAuth } from '@/lib/auth/auth-provider';
import { publicEnv } from '@/lib/env';

export function LoginScreen({ error }: { error?: unknown }) {
  const t = useTranslations();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-6 pb-10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="grid size-10 place-items-center rounded-2xl bg-brand-600 text-xl text-white"
          >
            🛒
          </span>
          <span className="text-xl font-bold">{t('app.name')}</span>
        </div>
        <LocaleSwitcher />
      </header>

      <Card>
        <h1 className="text-2xl font-bold">{t('auth.openInTelegram')}</h1>
        <p className="mt-2 text-slate-600">{t('auth.openInTelegramHint')}</p>
      </Card>

      <ErrorMessage error={error} />
      {publicEnv.devLogin ? <DevLogin /> : null}
      <SystemStatus />
    </main>
  );
}

function DevLogin() {
  const t = useTranslations();
  const { loginDev } = useAuth();
  const users = useQuery({
    queryKey: ['auth', 'dev-users'],
    queryFn: authApi.devUsers,
    retry: false,
  });
  const login = useMutation({ mutationFn: loginDev });

  return (
    <Card title={t('auth.devLoginTitle')}>
      <p className="mb-3 text-sm text-slate-500">{t('auth.devLoginHint')}</p>
      <ErrorMessage error={users.error ?? login.error} />
      <div className="flex flex-col gap-2">
        {users.data?.map((user) => (
          <Button
            key={`${user.companyId}-${user.telegramId}`}
            variant="secondary"
            block
            disabled={login.isPending}
            onClick={() => login.mutate(user.telegramId)}
            className="justify-between"
          >
            <span>{user.name}</span>
            <span className="text-sm font-normal text-slate-500">
              {t(`roles.${user.role}`)} · {user.companyName}
            </span>
          </Button>
        ))}
      </div>
    </Card>
  );
}
