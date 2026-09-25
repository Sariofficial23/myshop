'use client';

import { Permission } from '@myshop/shared';
import { cn } from '@myshop/ui';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Boxes,
  Building2,
  CalendarClock,
  ChartColumn,
  ClipboardCheck,
  Contact,
  FileMinus,
  House,
  LogOut,
  Package,
  PackagePlus,
  Receipt,
  ShieldCheck,
  ShieldUser,
  ShoppingBag,
  Store,
  Tags,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { adminApi } from '@/lib/api/admin';
import { useAuth, useCan, useMe } from '@/lib/auth/auth-provider';
import { AppIcon, type IconTint } from './icons/app-icon';
import { LocaleSwitcher } from './locale-switcher';

interface SideItem {
  href: string;
  label: string;
  icon: LucideIcon;
  tint: IconTint;
  visible: boolean;
  /** Дополнительные разделы, при которых пункт подсвечивается. */
  also?: string[];
}

const matches = (pathname: string, path: string) =>
  path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);

/**
 * Боковое меню для широкого экрана (ноутбук, компьютер) — в стиле боковой панели macOS.
 * На телефоне его нет: там работает нижний таб-бар.
 */
export function SideNav() {
  const t = useTranslations();
  const pathname = usePathname();
  const can = useCan();
  const me = useMe();
  const { logout, inTelegram } = useAuth();
  const isAdmin = useQuery({
    queryKey: ['admin', 'me'],
    queryFn: adminApi.me,
    enabled: inTelegram,
    retry: false,
  });

  const groups: Array<{ title?: string; items: SideItem[] }> = [
    {
      items: [
        { href: '/', label: t('nav.home'), icon: House, tint: 'blue', visible: true },
        {
          href: '/sale',
          label: t('nav.sale'),
          icon: ShoppingBag,
          tint: 'blue',
          visible: can(Permission.SALES_CREATE),
        },
        {
          href: '/sales',
          label: t('sideNav.salesHistory'),
          icon: Receipt,
          tint: 'teal',
          visible: can(Permission.SALES_VIEW),
          also: ['/returns'],
        },
        {
          href: '/reports',
          label: t('nav.reports'),
          icon: ChartColumn,
          tint: 'indigo',
          visible: can(Permission.SALES_VIEW),
        },
      ],
    },
    {
      title: t('sideNav.stock'),
      items: [
        {
          href: '/products',
          label: t('stockTabs.products'),
          icon: Package,
          tint: 'orange',
          visible: can(Permission.PRODUCTS_VIEW),
        },
        {
          href: '/stock',
          label: t('stockTabs.stock'),
          icon: Boxes,
          tint: 'yellow',
          visible: can(Permission.STOCK_VIEW),
        },
        {
          href: '/purchases',
          label: t('stockTabs.purchases'),
          icon: PackagePlus,
          tint: 'green',
          visible: can(Permission.PURCHASES_MANAGE),
        },
        {
          href: '/transfers',
          label: t('stockTabs.transfers'),
          icon: ArrowLeftRight,
          tint: 'blue',
          visible: can(Permission.STOCK_VIEW),
        },
        {
          href: '/write-offs',
          label: t('stockTabs.writeOffs'),
          icon: FileMinus,
          tint: 'red',
          visible: can(Permission.STOCK_VIEW),
        },
        {
          href: '/inventories',
          label: t('stockTabs.inventories'),
          icon: ClipboardCheck,
          tint: 'purple',
          visible: can(Permission.INVENTORY_MANAGE),
        },
      ],
    },
    {
      title: t('sideNav.money'),
      items: [
        {
          href: '/cash',
          label: t('more.cash'),
          icon: Wallet,
          tint: 'green',
          visible: can(Permission.CASH_MANAGE),
        },
        {
          href: '/installments',
          label: t('more.installments'),
          icon: CalendarClock,
          tint: 'orange',
          visible: can(Permission.SALES_VIEW),
        },
        {
          href: '/warranty',
          label: t('more.warranty'),
          icon: ShieldCheck,
          tint: 'teal',
          visible: can(Permission.SALES_VIEW),
          also: ['/warranty-claims'],
        },
      ],
    },
    {
      title: t('sideNav.people'),
      items: [
        {
          href: '/customers',
          label: t('more.customers'),
          icon: Contact,
          tint: 'pink',
          visible: can(Permission.CUSTOMERS_MANAGE),
        },
        {
          href: '/suppliers',
          label: t('more.suppliers'),
          icon: Truck,
          tint: 'purple',
          visible: can(Permission.SUPPLIERS_MANAGE),
        },
      ],
    },
    {
      title: t('sideNav.settings'),
      items: [
        {
          href: '/company',
          label: t('more.company'),
          icon: Building2,
          tint: 'gray',
          visible: true,
          also: ['/more'],
        },
        {
          href: '/branches',
          label: t('more.branches'),
          icon: Store,
          tint: 'blue',
          visible: can(Permission.BRANCHES_VIEW),
        },
        {
          href: '/users',
          label: t('more.users'),
          icon: Users,
          tint: 'indigo',
          visible: can(Permission.USERS_VIEW),
        },
        {
          href: '/catalog',
          label: t('more.catalog'),
          icon: Tags,
          tint: 'yellow',
          visible: can(Permission.PRODUCTS_VIEW),
        },
        {
          href: '/admin',
          label: t('admin.title'),
          icon: ShieldUser,
          tint: 'indigo',
          visible: Boolean(isAdmin.data),
        },
      ],
    },
  ];

  return (
    <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r border-black/10 bg-white/70 backdrop-blur-xl lg:flex">
      <div className="px-5 pt-5 pb-3">
        <p className="truncate text-lg font-bold">{me.company.name}</p>
        <p className="truncate text-sm text-[#8e8e93]">
          {[me.user.firstName, me.user.lastName].filter(Boolean).join(' ')} ·{' '}
          {t(`roles.${me.role}`)}
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {groups.map((group, index) => {
          const items = group.items.filter((item) => item.visible);
          if (!items.length) return null;
          return (
            <div key={group.title ?? index} className="mt-2.5 first:mt-0">
              {group.title ? (
                <p className="px-2 pb-1 text-[11px] font-semibold tracking-wide text-[#8e8e93] uppercase">
                  {group.title}
                </p>
              ) : null}
              <ul className="flex flex-col gap-0.5">
                {items.map((item) => {
                  const active = [item.href, ...(item.also ?? [])].some((p) =>
                    matches(pathname, p),
                  );
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex min-h-8 items-center gap-2.5 rounded-lg px-2 text-[14px] font-medium',
                          active ? 'bg-brand-600/12 text-brand-700' : 'hover:bg-black/5',
                        )}
                      >
                        <AppIcon icon={item.icon} tint={item.tint} size="sm" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="flex items-center gap-2 border-t border-black/10 px-4 py-3">
        <LocaleSwitcher />
        <button
          type="button"
          onClick={() => void logout()}
          className="ml-auto flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-[#8e8e93] hover:bg-black/5 hover:text-slate-900"
        >
          <LogOut aria-hidden size={16} />
          {t('auth.logout')}
        </button>
      </div>
    </aside>
  );
}
