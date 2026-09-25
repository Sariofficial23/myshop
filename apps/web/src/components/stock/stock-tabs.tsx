'use client';

import { Permission } from '@myshop/shared';
import { cn } from '@myshop/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCan } from '@/lib/auth/auth-provider';

/** Разделы вкладки «Склад»: товары, остатки и складские документы (прокручиваются по горизонтали). */
export function StockTabs() {
  const t = useTranslations('stockTabs');
  const can = useCan();
  const pathname = usePathname();
  const tabs = [
    { href: '/products', key: 'products', visible: can(Permission.PRODUCTS_VIEW) },
    { href: '/stock', key: 'stock', visible: can(Permission.STOCK_VIEW) },
    { href: '/purchases', key: 'purchases', visible: can(Permission.PURCHASES_MANAGE) },
    { href: '/transfers', key: 'transfers', visible: can(Permission.STOCK_VIEW) },
    { href: '/write-offs', key: 'writeOffs', visible: can(Permission.STOCK_VIEW) },
    { href: '/inventories', key: 'inventories', visible: can(Permission.INVENTORY_MANAGE) },
  ].filter((tab) => tab.visible);
  if (tabs.length < 2) return null;
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            ref={
              active
                ? (el) => el?.scrollIntoView({ block: 'nearest', inline: 'center' })
                : undefined
            }
            className={cn(
              'flex min-h-10 shrink-0 items-center justify-center rounded-full px-4 text-sm font-semibold whitespace-nowrap',
              active ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200',
            )}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}

export const STOCK_SECTION_PATHS = [
  '/products',
  '/stock',
  '/purchases',
  '/transfers',
  '/write-offs',
  '/inventories',
];
