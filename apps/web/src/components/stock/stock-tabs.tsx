'use client';

import { Permission } from '@myshop/shared';
import { cn } from '@myshop/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCan } from '@/lib/auth/auth-provider';

/** Переключатель внутри вкладки «Склад»: Товары | Остатки | Приходы. */
export function StockTabs() {
  const t = useTranslations('stockTabs');
  const can = useCan();
  const pathname = usePathname();
  const tabs = [
    { href: '/products', key: 'products', visible: can(Permission.PRODUCTS_VIEW) },
    { href: '/stock', key: 'stock', visible: can(Permission.STOCK_VIEW) },
    { href: '/purchases', key: 'purchases', visible: can(Permission.PURCHASES_MANAGE) },
  ].filter((tab) => tab.visible);
  if (tabs.length < 2) return null;
  return (
    <nav className="flex gap-1 rounded-2xl bg-slate-100 p-1">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-10 flex-1 items-center justify-center rounded-xl text-sm font-semibold',
              active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
            )}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}

export const STOCK_SECTION_PATHS = ['/products', '/stock', '/purchases'];
