'use client';

import { cn } from '@myshop/ui';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Ширина страницы на большом экране. Разделы со списками и отчётами занимают всю ширину,
 * формы и карточки документов — умеренную колонку, чтобы поля не растягивались на весь экран.
 * На телефоне ширина одна и та же (max-w-md), как в Mini App.
 */
function desktopWidth(pathname: string): string {
  const depth = pathname.split('/').filter(Boolean).length;
  if (pathname === '/company' || pathname === '/more') return 'lg:max-w-2xl';
  if (depth >= 2) return 'lg:max-w-3xl';
  return 'lg:max-w-6xl';
}

export function AppMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="lg:pl-64">
      <main
        className={cn(
          'mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-6 pb-28 lg:px-8 lg:pt-8 lg:pb-12',
          desktopWidth(pathname),
        )}
      >
        {children}
      </main>
    </div>
  );
}
