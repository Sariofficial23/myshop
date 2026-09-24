import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations('errors');
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center text-slate-600">
      {t('NOT_FOUND')}
    </main>
  );
}
