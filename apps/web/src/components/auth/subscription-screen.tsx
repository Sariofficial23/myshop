'use client';

import type { MeResponse } from '@myshop/shared';
import { Button, Card } from '@myshop/ui';
import { useMutation } from '@tanstack/react-query';
import { Clock, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ErrorMessage } from '@/components/error-message';
import { AppIcon } from '@/components/icons/app-icon';
import { useAuth } from '@/lib/auth/auth-provider';

/** Компания ждёт активации администратором или заблокирована — работать нельзя. */
export function SubscriptionScreen({ me }: { me: MeResponse }) {
  const t = useTranslations('subscription');
  const { reloadMe, logout } = useAuth();
  const check = useMutation({ mutationFn: reloadMe });
  const pending = me.company.subscription.state === 'PENDING';

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <AppIcon
          icon={pending ? Clock : Lock}
          tint={pending ? 'orange' : 'red'}
          size="lg"
          className="size-16 rounded-[18px]"
        />
        <h1 className="text-[26px] font-bold">{pending ? t('pendingTitle') : t('blockedTitle')}</h1>
        <p className="text-[15px] text-[#8e8e93]">
          {pending ? t('pendingText', { company: me.company.name }) : t('blockedText')}
        </p>
      </div>
      <Card>
        <p className="text-[13px] text-[#8e8e93] uppercase">{t('company')}</p>
        <p className="text-lg font-semibold">{me.company.name}</p>
        {me.user.email ? <p className="text-[15px] text-[#8e8e93]">{me.user.email}</p> : null}
      </Card>
      <ErrorMessage error={check.error} />
      <Button block disabled={check.isPending} onClick={() => check.mutate()}>
        {t('check')}
      </Button>
      <Button block variant="secondary" onClick={() => void logout()}>
        {t('logout')}
      </Button>
    </main>
  );
}
