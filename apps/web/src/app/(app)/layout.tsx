import type { ReactNode } from 'react';
import { AuthGate } from '@/components/auth/auth-gate';
import { BottomNav } from '@/components/bottom-nav';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-6 pb-28">
        {children}
      </main>
      <BottomNav />
    </AuthGate>
  );
}
