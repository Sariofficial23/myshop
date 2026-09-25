import type { ReactNode } from 'react';
import { AppMain } from '@/components/app-main';
import { AuthGate } from '@/components/auth/auth-gate';
import { SubscriptionBanner } from '@/components/auth/subscription-banner';
import { BottomNav } from '@/components/bottom-nav';
import { SideNav } from '@/components/side-nav';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <SideNav />
      <AppMain>
        <SubscriptionBanner />
        {children}
      </AppMain>
      <BottomNav />
    </AuthGate>
  );
}
