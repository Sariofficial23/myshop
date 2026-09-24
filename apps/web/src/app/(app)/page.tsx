'use client';

import { Card } from '@myshop/ui';
import { useTranslations } from 'next-intl';
import { SystemStatus } from '@/components/system-status';
import { useMe } from '@/lib/auth/auth-provider';

export default function HomePage() {
  const t = useTranslations();
  const me = useMe();
  return (
    <>
      <header>
        <h1 className="text-2xl font-bold">{t('home.greeting', { name: me.user.firstName })}</h1>
        <p className="text-slate-600">
          {t('home.roleIn', { role: t(`roles.${me.role}`), company: me.company.name })}
        </p>
      </header>

      <Card title={me.allBranches ? t('home.allBranches') : t('home.yourBranches')}>
        <ul className="flex flex-wrap gap-2">
          {me.branches.map((branch) => (
            <li
              key={branch.id}
              className="rounded-full bg-brand-50 px-3 py-1.5 text-sm text-brand-800"
            >
              {branch.name}
            </li>
          ))}
        </ul>
      </Card>

      <p className="rounded-2xl bg-brand-50 p-4 text-sm text-brand-800">{t('home.stageNotice')}</p>

      <SystemStatus />
    </>
  );
}
