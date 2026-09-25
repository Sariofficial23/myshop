'use client';

import { Permission } from '@myshop/shared';
import { cn } from '@myshop/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCan } from '@/lib/auth/auth-provider';
import { STOCK_SECTION_PATHS } from './stock/stock-tabs';

/**
 * Нижняя навигация. Раздел "Отчёты" добавляется на этапе,
 * где появляется его реальная функциональность.
 */
const SALE_SECTION_PATHS = ['/sale', '/sales'];

const inSection = (paths: readonly string[]) => (pathname: string) =>
  paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
const isStockSection = inSection(STOCK_SECTION_PATHS);
const isSaleSection = inSection(SALE_SECTION_PATHS);

export function BottomNav() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const can = useCan();
  const items = [
    { href: '/', icon: '🏠', key: 'home', match: (p: string) => p === '/', visible: true },
    {
      href: can(Permission.SALES_CREATE) ? '/sale' : '/sales',
      icon: '🛒',
      key: 'sale',
      match: isSaleSection,
      visible: can(Permission.SALES_CREATE) || can(Permission.SALES_VIEW),
    },
    { href: '/products', icon: '📦', key: 'stock', match: isStockSection, visible: true },
    {
      href: '/more',
      icon: '☰',
      key: 'more',
      match: (p: string) => p !== '/' && !isStockSection(p) && !isSaleSection(p),
      visible: true,
    },
  ].filter((item) => item.visible);
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
