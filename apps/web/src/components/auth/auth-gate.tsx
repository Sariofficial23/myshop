'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { FullScreenSpinner } from '@/components/spinner';
import { useAuth } from '@/lib/auth/auth-provider';
import { LoginScreen } from './login-screen';
import { SubscriptionScreen } from './subscription-screen';

/** Показывает приложение только после входа и только активной (или истёкшей — просмотр) компании. */
export function AuthGate({ children }: { children: ReactNode }) {
  const t = useTranslations('auth');
  const { state } = useAuth();
  switch (state.status) {
    case 'loading':
      return <FullScreenSpinner label={t('loading')} />;
    case 'unauthenticated':
      return <LoginScreen error={state.error} />;
    case 'authenticated': {
      const subscription = state.me.company.subscription.state;
      if (subscription === 'PENDING' || subscription === 'BLOCKED') {
        return <SubscriptionScreen me={state.me} />;
      }
      return children;
    }
  }
}
