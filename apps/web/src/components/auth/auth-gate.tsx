'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { FullScreenSpinner } from '@/components/spinner';
import { useAuth } from '@/lib/auth/auth-provider';
import { LoginScreen } from './login-screen';
import { OnboardingScreen } from './onboarding-screen';

/** Показывает приложение только после входа. */
export function AuthGate({ children }: { children: ReactNode }) {
  const t = useTranslations('auth');
  const { state } = useAuth();
  switch (state.status) {
    case 'loading':
      return <FullScreenSpinner label={t('loading')} />;
    case 'no-membership':
      return <OnboardingScreen telegramId={state.telegramId} />;
    case 'unauthenticated':
      return <LoginScreen error={state.error} />;
    case 'authenticated':
      return children;
  }
}
