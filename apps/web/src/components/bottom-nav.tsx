'use client';

import { Permission } from '@myshop/shared';
import { cn } from '@myshop/ui';
import { ChartColumn, Ellipsis, House, Package, ShoppingBag, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCan } from '@/lib/auth/auth-provider';
import { STOCK_SECTION_PATHS } from './stock/stock-tabs';

/** Нижняя навигация в стиле iOS tab bar: Главная, Продажа, Склад, Отчёты, Ещё. */
const SALE_SECTION_PATHS = ['/sale', '/sales', '/returns'];
const REPORT_SECTION_PATHS = ['/reports'];

const inSection = (paths: readonly string[]) => (pathname: string) =>
  paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
const isStockSection = inSection(STOCK_SECTION_PATHS);
const isSaleSection = inSection(SALE_SECTION_PATHS);
const isReportSection = inSection(REPORT_SECTION_PATHS);

interface NavItem {
  href: string;
  icon: LucideIcon;
  key: string;
  match: (pathname: string) => boolean;
  visible: boolean;
}

export function BottomNav() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const can = useCan();
  const items: NavItem[] = [
    { href: '/', icon: House, key: 'home', match: (p) => p === '/', visible: true },
    {
      href: can(Permission.SALES_CREATE) ? '/sale' : '/sales',
      icon: ShoppingBag,
      key: 'sale',
      match: isSaleSection,
      visible: can(Permission.SALES_CREATE) || can(Permission.SALES_VIEW),
    },
    { href: '/products', icon: Package, key: 'stock', match: isStockSection, visible: true },
    {
      href: '/reports',
      icon: ChartColumn,
      key: 'reports',
      match: isReportSection,
      visible: can(Permission.SALES_VIEW),
    },
    {
      href: '/more',
      icon: Ellipsis,
      key: 'more',
      match: (p) => p !== '/' && !isStockSection(p) && !isSaleSection(p) && !isReportSection(p),
      visible: true,
    },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t lg:hidden border-black/10 bg-white/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150">
      <ul className="mx-auto flex max-w-md">
        {items
          .filter((item) => item.visible)
          .map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <li key={item.key} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium',
                    active ? 'text-brand-600' : 'text-[#8e8e93]',
                  )}
                >
                  <Icon aria-hidden size={24} strokeWidth={active ? 2.4 : 1.9} />
                  {t(item.key)}
                </Link>
              </li>
            );
          })}
      </ul>
    </nav>
  );
}
