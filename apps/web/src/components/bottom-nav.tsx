'use client';

import { cn } from '@myshop/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * Нижняя навигация. Разделы "Продажа", "Склад", "Отчёты" добавляются
 * на этапах, где появляется их реальная функциональность.
 */
const items = [
  { href: '/', icon: '🏠', key: 'home', match: (p: string) => p === '/' },
  { href: '/more', icon: '☰', key: 'more', match: (p: string) => p !== '/' },
] as const;

export function BottomNav() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-md">
        {items.map((item) => {
          const active = item.match(pathname);
          return (
            <li key={item.key} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium',
                  active ? 'text-brand-600' : 'text-slate-500',
                )}
              >
                <span aria-hidden className="text-xl">
                  {item.icon}
                </span>
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
