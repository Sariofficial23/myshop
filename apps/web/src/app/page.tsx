import { Card } from '@myshop/ui';
import { getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { SystemStatus } from '@/components/system-status';

export default async function HomePage() {
  const t = await getTranslations();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-6 pb-10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="grid size-10 place-items-center rounded-2xl bg-brand-600 text-xl text-white"
          >
            🛒
          </span>
          <span className="text-xl font-bold">{t('app.name')}</span>
        </div>
        <LocaleSwitcher />
      </header>

      <Card>
        <h1 className="text-2xl font-bold">{t('home.title')}</h1>
        <p className="mt-2 text-slate-600">{t('home.subtitle')}</p>
      </Card>

      <SystemStatus />

      <p className="rounded-2xl bg-brand-50 p-4 text-sm text-brand-800">{t('home.stageNotice')}</p>
    </main>
  );
}
